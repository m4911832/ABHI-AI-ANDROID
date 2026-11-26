import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
app.use(helmet());
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false }));

const apiKey = process.env.GROQ_API_KEY;
const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
if (!apiKey) {
  console.error("Missing GROQ_API_KEY. Add it to the backend environment; never place it in the Android app.");
  process.exit(1);
}

const assistantInstructions = `
You are ABHI AI, a capable, polite personal assistant.
The user may speak Hindi, English, or Bhojpuri. In Auto-detect mode, identify
which language the user used and respond naturally in that language. If the
user speaks Bhojpuri, reply in conversational Bhojpuri (Devanagari or Roman
script matching the user where practical). Use natural Indian English/Hindi.
Be practical, concise, and action-oriented. You can help plan emails, schedules,
reports, sales reviews and calculations. Never claim you sent a message, made a
call, blocked a caller, changed a file, or controlled the phone unless a real
connected tool completed it. Never ask for passwords or API keys in chat.
Prepare consequential actions and request explicit user approval before execution.
`;

app.get("/health", (_req, res) => res.json({ ok: true, service: "ABHI AI Groq backend" }));
app.post("/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const language = ["Auto-detect", "Hindi", "English", "Bhojpuri"].includes(req.body?.language)
    ? req.body.language : "Auto-detect";
  if (!message) return res.status(400).json({ error: "message is required" });
  if (message.length > 8000) return res.status(413).json({ error: "message is too long" });
  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 1200,
        messages: [
          { role: "system", content: assistantInstructions + `\nPreferred language mode: ${language}.` },
          { role: "user", content: message }
        ]
      }),
      signal: AbortSignal.timeout(55_000)
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("Groq request failed:", upstream.status, detail.slice(0, 500));
      return res.status(502).json({ error: "AI service request failed. Check Groq model access and backend configuration." });
    }
    const data = await upstream.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    res.json({ reply: reply || "I couldn't generate a reply. Please try again." });
  } catch (error) {
    console.error("Groq connection error:", error?.message || "unknown error");
    res.status(502).json({ error: "Could not reach the AI service. Please try again." });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => console.log(`ABHI AI Groq backend listening on port ${port}`));
