module.exports = async function handler(req, res) {
  // CORS zodat GitHub Pages dit endpoint kan aanroepen
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handige GET voor test in browser (crasht niet)
  if (req.method === "GET") {
    return res.status(200).json({
      status: "OK",
      message: "Endpoint is live. Use POST from the frontend."
    });
  }

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = req.body || {};
    const messages = body.messages || [];
    const maxQuestions = body.maxQuestions ?? 5;

    // Azure OpenAI env vars (staan in Vercel → Environment Variables)
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;       // https://...openai.azure.com
    const apiKey = process.env.AZURE_OPENAI_API_KEY;          // geheim
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;   // deployment name
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION;  // bijv 2024-02-15-preview

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

    const url =
