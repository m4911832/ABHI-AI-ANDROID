import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "32kb" }));

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Missing GROQ_API_KEY. Set it in the hosting provider's environment variables.");
  process.exit(1);
}

const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const assistantInstructions = `
You are ABHI AI, a capable, polite personal assistant for the user.
The user speaks Hindi and English. Reply in the language used by the user,
or follow an explicit language request. Use natural Indian English/Hindi.
Be practical, concise, and action-oriented.
You may help plan emails, schedules, reports, sales reviews, calculations,
and other work. Do not claim you have sent a message, made a call, changed
a file, booked anything, or controlled the phone unless a connected tool
actually completed that action. In this Version 1 chat build, you have no
external action tools. For actions with real-world consequences, prepare
the proposed content and clearly ask for confirmation before any future
integration executes it. Never ask for passwords or API keys in chat.
`;

app.get("/health", (_req, res) => res.json({ ok: true, service: "ABHI AI backend" }));

app.post("/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const language = req.body?.language === "Hindi" ? "Hindi" : "English";
  if (!message) return res.status(400).json({ error: "message is required" });
  if (message.length > 8000) return res.status(413).json({ error: "message is too long" });

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: assistantInstructions + `\nPreferred interface language: ${language}.` },
          { role: "user", content: message }
        ]
      })
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      console.error("Groq request failed:", upstream.status, data?.error?.message || "unknown error");
      return res.status(502).json({ error: "AI service request failed. Check Groq model access and backend configuration." });
    }
    const reply = data?.choices?.[0]?.message?.content;
    res.json({ reply: typeof reply === "string" && reply.trim() ? reply : "I couldn't generate a reply. Please try again." });
  } catch (error) {
    console.error("Groq connection failed:", error?.message || "unknown error");
    res.status(502).json({ error: "Could not connect to the AI service." });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, "0.0.0.0", () => {
  console.log(`ABHI AI backend listening on port ${port}`);
});
