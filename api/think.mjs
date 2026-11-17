// Longer reasoning and small programs for the console voice agent on https://ai.platformontology.lol.
// The Live voice model answers fast but cannot think for long or run code (Gemini refuses code execution
// on the native audio model), so the page sends that work here and gets the answer back later.
//   mode "think": a reasoning call on a Gemini text model that returns numbered thoughts, an answer and
//                 whether more thinking would help (the page can continue it on its own).
//   mode "code":  the same model with Gemini's sandboxed code execution, for computing over data.
//   mode "search": a short Live session with Google Search and no other tools, returning a spoken style answer
//                 and its sources. Search runs here and not in the page's Live session: with Google Search on,
//                 that session closed with 1011 about half the time once the console had its full set of tools.
//                 It uses Live because search grounding on the text models has no free tier quota.
// Guarded like api/gemini-token.mjs: right origin, a session, and hourly quotas per account, per network
// (HMAC of the IP) and in all, kept as short lived markers in po_auth.verification, reserved before they are counted. Input and output are
// capped so one call stays cheap. The key belongs to a project with no billing (free tier). Keys are never logged.

import { createHmac, randomBytes } from "node:crypto";
import { auth, db } from "./_lib/auth.mjs";
import { json } from "./_lib/lake.mjs";

// Tried in order: a model under high demand (503), out of quota (429) or too slow moves on to the next.
const MODELS = [...new Set([process.env.GEMINI_THINK_MODEL, "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"].filter(Boolean))];
const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
const ORIGINS = /^https:\/\/(ai\.platformontology\.lol|platformontology\.lol|[a-z0-9-]+\.vercel\.app)$|^http:\/\/localhost(:\d+)?$/;
const PER_USER = 30;
const PER_NET = 45;
const GLOBAL = 300;
const HOUR = 60 * 60e3;
const MAX_IN = 12_000;
const MAX_OUT = 4096;

export const maxDuration = 120;

const live = (identifier, now) => db({
  op: "count", model: "verification",
  where: [{ field: "identifier", value: identifier }, { field: "expires_at", operator: "gt", value: new Date(now).toISOString(), connector: "AND" }],
}).then((n) => Number(n) || 0);
const mark = async (identifier, now) => {
  const id = randomBytes(12).toString("hex");
  await db({ op: "create", model: "verification", data: { id, identifier, value: "1", expires_at: new Date(now + HOUR).toISOString() } });
  return id;
};
const unmark = (ids) => Promise.all(ids.map((id) => db({ op: "delete", model: "verification", where: [{ field: "id", value: id }] }).catch(() => null)));

const THINK_PROMPT = `You are the slow, careful thinking of a voice assistant inside a web console that maps browser capabilities.
Work the problem step by step in numbered thoughts. Revise an earlier thought when you find it wrong, and branch when two
approaches are worth comparing. Reply only with JSON of this shape:
{"thoughts":[{"n":1,"text":"...","revises":null,"branch":null}],"answer":"short spoken answer, at most 4 sentences",
 "needs_more":false,"next_focus":"what to think about next if needs_more is true"}`;

const CODE_PROMPT = `You run small programs for a voice assistant. Write and execute Python to do the task exactly, using only the
data given. Then state the result in at most 3 plain sentences.`;

const SEARCH_PROMPT = `You search the web for a voice assistant. Answer the question from current search results in at most
4 plain spoken sentences, with dates and numbers where they matter. Say so if the results do not answer it.`;

const PROMPTS = { think: THINK_PROMPT, code: CODE_PROMPT, search: SEARCH_PROMPT };

const clip = (v, n) => String(v ?? "").slice(0, n);

function readThink(data) {
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  try {
    const o = JSON.parse(text.replace(/^```(json)?\s*|\s*```$/g, ""));
    return {
      answer: clip(o.answer, 2000),
      thoughts: (Array.isArray(o.thoughts) ? o.thoughts : []).slice(0, 20).map((t, i) => ({ n: Number(t?.n) || i + 1, text: clip(t?.text, 600), revises: t?.revises ?? null, branch: t?.branch ?? null })),
      needs_more: !!o.needs_more,
      next_focus: o.needs_more ? clip(o.next_focus, 300) : "",
    };
  } catch {
    return { answer: clip(text, 2000), thoughts: [], needs_more: false, next_focus: "" };
  }
}

function readCode(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return {
    answer: clip(parts.map((p) => p.text || "").join("").trim(), 2000),
    code: clip(parts.filter((p) => p.executableCode).map((p) => p.executableCode.code).join("\n\n"), 4000),
    output: clip(parts.filter((p) => p.codeExecutionResult).map((p) => p.codeExecutionResult.output || "").join("\n"), 3000),
    // Gemini may retry a failed program; the last run is the one the answer rests on.
    outcome: parts.filter((p) => p.codeExecutionResult).at(-1)?.codeExecutionResult?.outcome || null,
  };
}

// One search in its own Live session: a one use token (so the key never goes in a URL), Google Search only, and
// the answer read from the audio transcript. It returns shortly after generation ends rather than waiting for
// the audio to finish streaming, which halves the wait.
async function liveSearch(key, query) {
  const now = Date.now();
  const tr = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ uses: 1, expireTime: new Date(now + 2 * 60e3).toISOString(), newSessionExpireTime: new Date(now + 60e3).toISOString(), bidiGenerateContentSetup: { model: `models/${LIVE_MODEL}` }, fieldMask: "model" }),
  }).catch(() => null);
  const tok = tr?.ok ? (await tr.json()).name : null;
  if (!tok) { console.error("think search token", tr?.status ?? "no response"); return null; }
  return new Promise((resolve) => {
    const said = [], sources = new Map(), queries = new Set();
    let ws, grace, done = false;
    const end = (why) => {
      if (done) return;
      done = true; clearTimeout(timer); clearTimeout(grace);
      try { ws?.close(); } catch {}
      const answer = clip(said.join("").trim(), 2000);
      if (!answer) console.error("think search", why);
      resolve(answer ? { answer, sources: [...sources].slice(0, 5).map(([url, title]) => ({ title, url })), queries: [...queries].slice(0, 5) } : null);
    };
    const timer = setTimeout(() => end("timeout"), 45_000);
    try {
      ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(tok)}`);
    } catch { return end("no socket"); }
    ws.onopen = () => ws.send(JSON.stringify({ setup: {
      model: `models/${LIVE_MODEL}`, generationConfig: { responseModalities: ["AUDIO"] }, outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: SEARCH_PROMPT }] }, tools: [{ googleSearch: {} }],
    } }));
    ws.onmessage = async (e) => {
      const m = JSON.parse(typeof e.data === "string" ? e.data : await e.data.text());
      if (m.setupComplete) return ws.send(JSON.stringify({ realtimeInput: { text: query } }));
      const sc = m.serverContent;
      if (!sc) return;
      if (sc.outputTranscription?.text) said.push(sc.outputTranscription.text);
      for (const k of sc.groundingMetadata?.groundingChunks || []) if (k.web?.uri && sources.size < 5) sources.set(clip(k.web.uri, 500), clip(k.web.title, 200));
      for (const q of sc.groundingMetadata?.webSearchQueries || []) queries.add(clip(q, 200));
      if (sc.generationComplete && !grace) grace = setTimeout(() => end("generated"), 1500);
      if (sc.turnComplete) end("turn");
    };
    ws.onerror = () => end("socket error");
    ws.onclose = (e) => end(`closed ${e.code}`);
  });
}

export async function POST(req) {
  const origin = req.headers.get("origin") || "";
  if (!ORIGINS.test(origin)) return json(403, { error: "wrong origin" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: "Thinking is not set up yet." });
  const s = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!s?.user?.id) return json(401, { error: "Sign in first." });

  const body = await req.json().catch(() => null);
  const mode = Object.hasOwn(PROMPTS, body?.mode) ? body.mode : null;
  const problem = String(body?.problem ?? "").trim();
  const context = String(body?.context ?? "").trim();
  if (!mode || !problem) return json(400, { error: "Send mode (think, code or search) and problem." });
  // Refuse rather than cut: a calculation over part of the data would look right and be wrong.
  if (problem.length + context.length > MAX_IN) return json(413, { error: `That is too much text: keep the problem and data under ${MAX_IN} characters together.` });

  const now = Date.now();
  const ip = req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "none";
  const net = `think:n:${createHmac("sha256", process.env.BETTER_AUTH_SECRET || "").update(`net:${ip}`).digest("hex").slice(0, 32)}`;
  const mine = `think:u:${s.user.id}`;
  // Reserve first, then count: every request's own markers are in the count it checks, so parallel requests
  // cannot all pass on the same snapshot. The k-th reservation sees at least k markers, so at most the limit
  // pass. A refused request takes its markers back so it does not use up the shared allowance.
  const ids = await Promise.all([mark(mine, now), mark(net, now), mark("think:all", now)]);
  const [used, fromNet, all] = await Promise.all([live(mine, now), live(net, now), live("think:all", now)]);
  if (used > PER_USER || fromNet > PER_NET || all > GLOBAL) {
    await unmark(ids);
    return all > GLOBAL && used <= PER_USER && fromNet <= PER_NET
      ? json(429, { error: "Thinking is busy right now. Try again later." })
      : json(429, { error: "That is a lot of thinking for one hour. Try again later." });
  }

  if (mode === "search") {
    const r = await liveSearch(key, problem);
    return r ? json(200, { mode, model: LIVE_MODEL, ...r }) : json(502, { error: "Could not search right now. Try again in a minute." });
  }

  const user = context ? `${problem}\n\nCONTEXT:\n${context}` : problem;
  const request = JSON.stringify({
    systemInstruction: { parts: [{ text: PROMPTS[mode] }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    ...(mode === "code" ? { tools: [{ codeExecution: {} }] } : {}),
    generationConfig: {
      maxOutputTokens: MAX_OUT,
      thinkingConfig: { thinkingLevel: mode === "code" ? "low" : "medium" },
      ...(mode === "think" ? { responseMimeType: "application/json" } : {}),
    },
  });
  const deadline = now + 100_000;
  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: request,
      signal: AbortSignal.timeout(Math.min(left, 45_000)),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      return json(200, { mode, model, ...(mode === "code" ? readCode(data) : readThink(data)) });
    }
    console.error("think", mode, model, res ? res.status : "no response", res ? (await res.text()).slice(0, 200) : "");
  }
  return json(502, { error: "Could not think that through right now. Try again in a minute." });
}

export const GET = () => json(405, { error: "POST only" });
