const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SUPABASE_URL = "https://bgldorxkmjmvjpgtniej.supabase.co";
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MODELS = [
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

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
3. CAPTURER LE LEAD : dès que le visiteur montre de l'intérêt pour un traitement, propose-lui de laisser son NOM et son NUMÉRO DE TÉLÉPHONE pour que la clinique le rappelle, ou de prendre rendez-vous directement

COMMENT CAPTURER UN LEAD :
- Ne demande pas les coordonnées dès le premier message — réponds d'abord à la question
- Dès le 2ème ou 3ème échange, si l'intérêt est clair, demande naturellement : "Souhaitez-vous que notre équipe vous rappelle ? Il me faut juste votre nom et votre numéro de téléphone."
- Demande le nom et le téléphone UN PAR UN si le visiteur ne donne pas tout d'un coup
- Quand tu as reçu le nom ET le téléphone, remercie le visiteur et confirme que la clinique le contactera rapidement

RÈGLES :
- Réponds dans la langue du visiteur (français, arabe tunisien, ou anglais)
- Sois chaleureux, professionnel et concis (2-3 phrases maximum par réponse)
- IMPORTANT : écris en texte brut uniquement. N'utilise JAMAIS de formatage markdown : pas d'astérisques (**), pas de tirets de liste, pas de titres
- Ne donne JAMAIS de diagnostic médical ni de conseil médical personnalisé — pour toute question médicale, invite à consulter le dentiste en personne
- Si tu ne connais pas une information, dis-le honnêtement et propose d'appeler la clinique
`;

// ---------- Generic AI call with model failover ----------
async function askAI(apiMessages, maxTokens) {
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
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (aiRes.ok) {
      const data = await aiRes.json();
      const content = data.choices?.[0]?.message?.content || null;
      if (content) return content;
    } else {
      const errText = await aiRes.text();
      console.error(`Model ${model} failed:`, errText.slice(0, 200));
    }
  }
  return null;
}

// ---------- Lead extraction ----------
function looksLikePhone(text) {
  return /\d[\d\s.\-]{5,}\d/.test(text || "");
}

async function extractAndSaveLead(messages) {
  const conversation = messages
    .map((m) => `${m.role === "assistant" ? "Assistant" : "Visiteur"}: ${m.text}`)
    .join("\n");

  const extractionPrompt = `
Voici une conversation entre l'assistant d'une clinique dentaire et un visiteur du site web.

${conversation}

Extrais les informations du lead au format JSON STRICT (aucun texte avant ou après, pas de markdown) :
{
  "name": "nom du visiteur ou null",
  "phone": "numéro de téléphone ou null",
  "treatment": "traitement qui l'intéresse ou null",
  "language": "fr, ar ou en",
  "score": un nombre de 1 à 10 évaluant la qualité du lead (10 = très intéressé, traitement cher, coordonnées complètes ; 1 = simple curiosité)
}
`;

  const raw = await askAI([{ role: "user", content: extractionPrompt }], 200);
  if (!raw) return;

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const lead = JSON.parse(cleaned);

    if (!lead.phone) return; // no phone, not a complete lead

    // avoid duplicates: same phone already in the database
    const phoneKey = String(lead.phone).replace(/\D/g, "");
    const { data: existing } = await supabase
      .from("leads")
      .select("id, phone");

    const exists = (existing || []).some(
      (l) => String(l.phone).replace(/\D/g, "") === phoneKey
    );
    if (exists) return;

    const { error } = await supabase.from("leads").insert({
      name: lead.name,
      phone: lead.phone,
      treatment: lead.treatment,
      language: lead.language,
      score: lead.score,
    });

    if (error) {
      console.error("Supabase insert error:", error.message);
    } else {
      console.log("🎯 LEAD SAVED TO DATABASE:", lead);
    }
  } catch (err) {
    console.error("Lead extraction parse error:", raw?.slice(0, 200));
  }
}

// ---------- The /chat endpoint ----------
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

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

    const reply = await askAI(apiMessages, 300);

    if (!reply) {
      return res.status(502).json({ error: "AI provider error" });
    }

    res.json({ reply });

    const lastUserMsg = messages[messages.length - 1]?.text || "";
    if (looksLikePhone(lastUserMsg)) {
      extractAndSaveLead(messages.concat([{ role: "assistant", text: reply }]))
        .catch((e) => console.error("Lead save error:", e));
    }
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "internal error" });
  }
});

// ---------- View captured leads (temporary; dashboard comes later) ----------
app.get("/leads", async (req, res) => {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("captured_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get("/", (req, res) => res.json({ status: "ok", service: "clinic-ai-assistant" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));