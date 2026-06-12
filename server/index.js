const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

// ---------- The assistant's personality & knowledge (v1: hardcoded) ----------
const SYSTEM_PROMPT = `
Tu es l'assistant virtuel de la Clinique BrightSmile, un cabinet dentaire moderne à Tunis.

INFORMATIONS SUR LA CLINIQUE :
- Adresse : Avenue Habib Bourguiba, Tunis
- Téléphone : +216 70 000 000
- Horaires : Lundi à Samedi, 9h00 à 18h00
- Services : implants dentaires (à partir de 1200 TND), blanchiment (300 TND), orthodontie (bagues et gouttières invisibles, à partir de 2500 TND), facettes et couronnes céramique, soins esthétiques, détartrage (80 TND), consultation (50 TND)
- L'équipe parle français, arabe et anglais
- Patients internationaux bienvenus (devis gratuit pour les patients venant de l'étranger)

TON RÔLE :
1. Répondre aux questions sur la clinique, les services et les prix
2. Comprendre le besoin du visiteur (quel traitement l'intéresse, urgence ou non)
3. L'encourager poliment à laisser ses coordonnées ou prendre rendez-vous

RÈGLES :
- Réponds dans la langue du visiteur (français, arabe tunisien, ou anglais)
- Sois chaleureux, professionnel et concis (2-3 phrases maximum par réponse)
- Ne donne JAMAIS de diagnostic médical ni de conseil médical personnalisé — pour toute question médicale, invite à consulter le dentiste en personne
- Si tu ne connais pas une information, dis-le honnêtement et propose d'appeler la clinique
`;

// ---------- The /chat endpoint ----------
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body; // [{role: "user"|"assistant", text: "..."}]

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      })),
    ];

    let reply = null;

    for (const model of MODELS) {
      const aiRes = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + OPENROUTER_API_KEY,
        },
        body: JSON.stringify({
          model: model,
          messages: apiMessages,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (aiRes.ok) {
        const data = await aiRes.json();
        reply = data.choices?.[0]?.message?.content || null;
        if (reply) break; // success — stop trying models
      } else {
        const errText = await aiRes.text();
        console.error(`Model ${model} failed:`, errText.slice(0, 200));
        // loop continues to the next model
      }
    }

    if (!reply) {
      return res.status(502).json({ error: "AI provider error" });
    }

    res.json({ reply });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI provider error:", errText);
      return res.status(502).json({ error: "AI provider error" });
    }

    const data = await aiRes.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Désolé, je n'ai pas pu générer de réponse. Veuillez réessayer.";

    res.json({ reply });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// ---------- Health check ----------
app.get("/", (req, res) => res.json({ status: "ok", service: "clinic-ai-assistant" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));