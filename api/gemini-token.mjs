// Mints a one use Gemini Live ephemeral token for https://ai.platformontology.lol.
// The API key stays on the server; the page gets a token that can open one session within a minute
// and lasts 30 minutes. The key belongs to a project with no billing, so it runs on the free tier.
// Callers need a session (the page signs in anonymously first). Each mint leaves two short lived
// markers in po_auth.verification (per account, per network and shared) so the quota holds across
// instances: PER_USER an hour per account, PER_NET an hour per client IP (stored only as an HMAC,
// since anonymous accounts are free to make) and GLOBAL an hour in all.

import { createHmac, randomBytes } from "node:crypto";
import { auth, db } from "./_lib/auth.mjs";
import { json } from "./_lib/lake.mjs";

const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
const ORIGINS = /^https:\/\/(ai\.platformontology\.lol|platformontology\.lol|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/;
const PER_USER = 6;
const PER_NET = 10;
const GLOBAL = 120;
const HOUR = 60 * 60e3;

const live = (identifier, now) => db({
  op: "count", model: "verification",
  where: [{ field: "identifier", value: identifier }, { field: "expires_at", operator: "gt", value: new Date(now).toISOString(), connector: "AND" }],
}).then((n) => Number(n) || 0);
const mark = (identifier, now) => db({
  op: "create", model: "verification",
  data: { id: randomBytes(12).toString("hex"), identifier, value: "1", expires_at: new Date(now + HOUR).toISOString() },
});

export async function POST(req) {
  const origin = req.headers.get("origin") || "";
  if (!ORIGINS.test(origin)) return json(403, { error: "wrong origin" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: "Voice is not set up yet." });
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!s?.user?.id) return json(401, { error: "Sign in first." });

  const now = Date.now();
  const ip = req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "none";
  const net = `gemini:n:${createHmac("sha256", process.env.BETTER_AUTH_SECRET || "").update(`net:${ip}`).digest("hex").slice(0, 32)}`;
  const mine = `gemini:u:${s.user.id}`;
  const [used, fromNet, all] = await Promise.all([live(mine, now), live(net, now), live("gemini:all", now)]);
  if (used >= PER_USER || fromNet >= PER_NET) return json(429, { error: "That is a lot of voice sessions. Try again in an hour." });
  if (all >= GLOBAL) return json(429, { error: "Voice is busy right now. Try again later." });
  await Promise.all([mark(mine, now), mark(net, now), mark("gemini:all", now)]);

  // REST shape of AuthToken: the session config lock is bidiGenerateContentSetup.
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60e3).toISOString(),
      newSessionExpireTime: new Date(now + 60e3).toISOString(),
      bidiGenerateContentSetup: { model: `models/${MODEL}` },
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
