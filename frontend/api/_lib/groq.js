/* Groq chat completions in JSON mode. The key lives only in the server env (GROQ_API_KEY). */

import { HttpError } from "./http.js";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

export async function groqJson(systemPrompt, userContent, { temperature = 0, maxTokens = 2048 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new HttpError(500, "GROQ_API_KEY is not configured on the server");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.error?.message || `status ${res.status}`;
    throw new HttpError(res.status === 429 ? 429 : 502, `AI request failed: ${reason}`);
  }

  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    throw new HttpError(502, "AI returned an unreadable response, try again");
  }
}
