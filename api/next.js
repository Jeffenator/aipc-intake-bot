export default async function handler(req, res) {
  // CORS: zodat jouw GitHub Pages site deze API mag gebruiken
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { messages = [], questionCount = 0, maxQuestions = 5 } = req.body || {};

    // System prompt: regels voor doorvragen + classificatie
    const system = {
      role: "system",
      content:
        "Je bent een intake-assistent voor eindgebruikers (IT en niet-IT). " +
        "Doel: stel gerichte vervolgvragen om de essentie te achterhalen en classificeer als INC, RFI of CHG.\n\n" +
        "Regels:\n" +
        "- Stel maximaal " + maxQuestions + " vragen.\n" +
        "- Stel NOOIT generieke vragen. Maak elke vraag specifiek op basis van wat de gebruiker zegt.\n" +
        "- Als je genoeg info hebt: geef eerst een korte samenvatting en vraag bevestiging (ja/nee).\n" +
        "- Pas na 'ja' genereer je de ticket-output.\n\n" +
        "Wat je moet verzamelen:\n" +
        "INC: symptoom + foutmelding + impact + scope + sinds wanneer/frequentie + workaround.\n" +
        "RFI: doel van info + context + gewenste output + deadline.\n" +
        "CHG: wat moet veranderen/aanvraag + voor wie + gewenste eindtoestand + urgentie + scope.\n\n" +
        "Output ALTIJD als geldige JSON met EXACT deze velden:\n" +
        "{\n" +
        '  \"stage\": \"question\"|\"confirm\"|\"final\",\n' +
        '  \"nextQuestion\": string|null,\n' +
        '  \"summary\": string|null,\n' +
        '  \"classification\": \"INC\"|\"RFI\"|\"CHG\"|null,\n' +
        '  \"shortDescription\": string|null,\n' +
        '  \"description\": string|null,\n' +
        '  \"desiredOutcome\": string|null,\n' +
        '  \"reasoning\": string|null\n' +
        "}\n\n" +
        "Als stage='question': vul alleen nextQuestion.\n" +
        "Als stage='confirm': vul summary.\n" +
        "Als stage='final': vul classification + shortDescription + description + desiredOutcome + reasoning.\n" +
        "Gebruik eenvoudige Nederlandse taal."
    };

    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      // Fallback: voorkomt dat demo helemaal stuk gaat
      return res.status(200).json({
        stage: "question",
        nextQuestion: "AI key ontbreekt (OPENAI_API_KEY). Kun je zeggen wat de impact is: kun je nog doorwerken of ligt je werk stil?",
        summary: null,
        classification: null,
        shortDescription: null,
        description: null,
        desiredOutcome: null,
        reasoning: null
      });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [system, ...messages],
        temperature: 0.3
      })
    });

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Model moet JSON teruggeven
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        stage: "question",
        nextQuestion: "Ik kon de AI-output niet lezen. Kun je precies beschrijven wat er gebeurt en of je een foutmelding ziet?",
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
}
