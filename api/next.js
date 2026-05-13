const https = require("https");

module.exports = async function handler(req, res) {
  // CORS (GitHub Pages mag dit endpoint aanroepen)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handige test via browser
  if (req.method === "GET") {
    return res.status(200).json({
      status: "OK",
      message: "Endpoint is live. Use POST with JSON body."
    });
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    // --- Body robuust uitlezen (werkt ook als req.body leeg is) ---
    const rawBody = await readBody(req);
    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : (req.body || {});
    } catch {
      body = req.body || {};
    }

    const messages = body.messages || [];
    const maxQuestions = body.maxQuestions ?? 5;

    // --- Env vars (staan in Vercel → Settings → Environment Variables) ---
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;        // https://...openai.azure.com
    const apiKey = process.env.AZURE_OPENAI_API_KEY;           // geheim
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;    // deployment name
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION;   // bijv 2024-02-15-preview

    if (!endpoint || !apiKey || !deployment || !apiVersion) {
      return res.status(200).json({
        stage: "question",
        nextQuestion:
          "Backend mist configuratie. Zet in Vercel: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_API_VERSION.",
        summary: null,
        classification: null,
        shortDescription: null,
        description: null,
        desiredOutcome: null,
        reasoning: null
      });
    }

    // --- System prompt ---
    const system = {
      role: "system",
      content:
        "Je bent een intake-assistent voor eindgebruikers (IT en niet-IT). " +
        "Doel: stel gerichte vervolgvragen om de essentie te achterhalen en classificeer als INC, RFI of CHG.\n\n" +
        "Regels:\n" +
        "- Stel maximaal " + maxQuestions + " vragen.\n" +
        "- Stel NOOIT generieke vragen. Maak elke vraag specifiek op basis van context.\n" +
        "- Als je genoeg info hebt: geef eerst een samenvatting en vraag bevestiging (ja/nee).\n" +
        "- Pas na 'ja' geef je de ticket-output.\n\n" +
        "Verzamel minimaal:\n" +
        "INC: symptoom, foutmelding, impact, scope, sinds wanneer/frequentie, workaround.\n" +
        "RFI: doel van info, context, gewenste output, deadline.\n" +
        "CHG: wat aanvragen/wijzigen, voor wie, gewenste eindtoestand, urgentie, scope.\n\n" +
        "Output ALTIJD als geldige JSON met exact deze velden:\n" +
        "{\n" +
        '  \"stage\": \"question\"|\"confirm\"|\"final\",\n' +
        '  \"nextQuestion\": string|null,\n' +
        '  \"summary\": string|null,\n' +
        '  \"classification\": \"INC\"|\"RFI\"|\"CHG\"|null,\n' +
        '  \"shortDescription\": string|null,\n' +
        '  \"description\": string|null,\n' +
        '  \"desiredOutcome\": string|null,\n' +
        '  \"reasoning\": string|null\n' +
        "}\n"
    };

    const urlPath =
      `/openai/deployments/${encodeURIComponent(deployment)}` +
      `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const payload = JSON.stringify({
      messages: [system, ...messages],
    });

    const endpointHost = endpoint.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const options = {
      hostname: endpointHost,
      path: urlPath,
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const azureResponse = await httpsRequest(options, payload);

    // Azure geeft JSON terug; als er een error is, laten we die ook zien
    let azureJson;
    try {
      azureJson = JSON.parse(azureResponse);
    } catch {
      return res.status(500).json({
        error: "Azure response was not JSON",
        raw: azureResponse
      });
    }

    // Als Azure error teruggeeft, toon die (helpt enorm bij debuggen)
    if (azureJson.error) {
      return res.status(500).json({
        error: "Azure OpenAI error",
        details: azureJson.error
      });
    }

    const content = azureJson?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        stage: "question",
        nextQuestion:
          "Ik kon de AI-uitvoer niet lezen. Kun je precies beschrijven wat er gebeurt (incl. foutmelding) en wat de impact is?",
        summary: null,
        classification: null,
        shortDescription: null,
        description: null,
        desiredOutcome: null,
        reasoning: null
      };
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};

// ---- helpers ----
function readBody(req) {
  return new Promise((resolve) => {
    // als Vercel al parsed body heeft gezet
    if (req.body && typeof req.body === "object") return resolve(JSON.stringify(req.body));
    if (typeof req.body === "string") return resolve(req.body);

    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function httpsRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
