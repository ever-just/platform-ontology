// Mints a one use Gemini Live ephemeral token for https://ai.platformontology.lol.
// The API key stays on the server; the page gets a token that can open one session within a minute
// and lasts 30 minutes. The key belongs to a project with no billing, so it runs on the free tier.

import { json } from "./_lib/lake.mjs";

const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
const ORIGINS = /^https:\/\/(ai\.platformontology\.lol|platformontology\.lol|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/;

export async function POST(req) {
  const origin = req.headers.get("origin") || "";
  if (!ORIGINS.test(origin)) return json(403, { error: "wrong origin" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: "Voice is not set up yet." });
  const now = Date.now();
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60e3).toISOString(),
      newSessionExpireTime: new Date(now + 60e3).toISOString(),
      liveConnectConstraints: { model: `models/${MODEL}` },
    }),
  });
  if (!res.ok) {
    console.error("gemini token", res.status, (await res.text()).slice(0, 300));
    return json(502, { error: "Could not start a voice session. Try again in a minute." });
  }
  const t = await res.json();
  return json(200, { token: t.name, model: MODEL });
}

export const GET = () => json(405, { error: "POST only" });
