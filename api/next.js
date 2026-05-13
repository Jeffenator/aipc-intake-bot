export default async function handler(req, res) {
  // CORS (GitHub Pages mag deze API aanroepen)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { messages = [], questionCount = 0, maxQuestions = 5 } = req.body || {};

    // ENV VARS (komen in Vercel, NIET in GitHub)
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;       // https://...openai.azure.com
    const apiKey = process.env.AZURE_OPENAI_API_KEY;          // geheim
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;   // deployment name
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION;  // api-version

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
