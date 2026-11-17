// The Access Agent director. When a voice session goes quiet, the page posts a small state (what is granted, what
// was shown, the last few lines) and Jev (TypeSafe System One, fast and cheap) picks the next move. The questions
// and thresholds live in _lib/director-questions.mjs; the page can only send state. Same origin, session and
// quota rules as /api/gemini-token, with its own markers.

import { randomBytes } from "node:crypto";
import { auth, db } from "./_lib/auth.mjs";
import { json } from "./_lib/lake.mjs";
import { DIRECTOR_QUESTIONS, MIN_CONFIDENCE, QUIET_AT } from "./_lib/director-questions.mjs";

const ORIGINS = /^https:\/\/(ai\.platformontology\.lol|platformontology\.lol|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/;
const PER_USER = 60;
const GLOBAL = 2000;
const HOUR = 60 * 60e3;
const MODEL = process.env.JEV_MODEL || "jev-latest";

const live = (identifier, now) => db({
  op: "count", model: "verification",
  where: [{ field: "identifier", value: identifier }, { field: "expires_at", operator: "gt", value: new Date(now).toISOString(), connector: "AND" }],
}).then((n) => Number(n) || 0);
const mark = (identifier, now) => db({
  op: "create", model: "verification",
  data: { id: randomBytes(12).toString("hex"), identifier, value: "1", expires_at: new Date(now + HOUR).toISOString() },
});

const list = (x, n) => (Array.isArray(x) ? x : []).slice(-n).map((v) => String(v).slice(0, 300));

export async function POST(req) {
  const origin = req.headers.get("origin") || "";
  if (!ORIGINS.test(origin)) return json(403, { error: "wrong origin" });
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return json(503, { error: "Director is not set up." });
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!s?.user?.id) return json(401, { error: "Sign in first." });

  const now = Date.now();
  const mine = `jev:u:${s.user.id}`;
  const [used, all] = await Promise.all([live(mine, now), live("jev:all", now)]);
  if (used >= PER_USER || all >= GLOBAL) return json(429, { error: "Director is resting." });
  await Promise.all([mark(mine, now), mark("jev:all", now)]);

  const b = await req.json().catch(() => ({}));
  const state = {
    granted: list(b.granted, 20), not_granted: list(b.not_granted, 20), shown: list(b.shown, 20),
    idle_s: Math.min(600, Number(b.idle_s) || 0), turns: Math.min(500, Number(b.turns) || 0), last_lines: list(b.last_lines, 8),
  };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST", signal: ctl.signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, state, questions: DIRECTOR_QUESTIONS }),
    });
    if (!res.ok) { console.error("jev", res.status, (await res.text()).slice(0, 200)); return json(502, { error: "Director unavailable." }); }
    const r = await res.json();
    const a = r.answers || {};
    const quiet = Number(a.wants_quiet?.noul) || 0;
    const move = a.next_move?.choice;
    const conf = Number(a.next_move?.confidence) || 0;
    const act = quiet < QUIET_AT && conf >= MIN_CONFIDENCE && move && move !== "stay_quiet" ? move : "stay_quiet";
    return json(200, { move: act, permission: a.permission?.choice !== "none" ? a.permission?.choice || null : null, confidence: conf, quiet, model: r.model || null });
  } catch (e) {
    return json(504, { error: "Director timed out." });
  } finally {
    clearTimeout(t);
  }
}

export const GET = () => json(405, { error: "POST only" });
