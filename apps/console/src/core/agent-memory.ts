// The agent's own memory in this browser: every tool it ran (with what changed and what failed), what
// was said across visits, and the loops it has running. Kept in localStorage so a new visit or a
// refresh still knows what happened before. Nothing here leaves the browser.

export type ActionRec = { t: number; tool: string; args: string; ok: boolean; error?: string; by: "agent" | "loop" };
export type TalkRec = { t: number; who: "you" | "ai"; text: string };

const A_KEY = "po.agent.actions.v1";
const T_KEY = "po.agent.talk.v1";
const MAX_A = 300, MAX_T = 200;

const has = () => typeof localStorage !== "undefined";
function load<T>(k: string): T[] { if (!has()) return []; try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } }
function save(k: string, v: unknown[]) { if (!has()) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } }

let actions: ActionRec[] | null = null;
let talk: TalkRec[] | null = null;
const A = () => (actions ||= load<ActionRec>(A_KEY));
const T = () => (talk ||= load<TalkRec>(T_KEY));

/** Tools that only read; they are logged but not counted as changes. */
const READS = /^(get_|list_|describe_|read_|look|recall_|evaluate_)/;

export function logAction(tool: string, args: Record<string, unknown>, res: { ok: boolean; error?: unknown }, by: "agent" | "loop" = "agent") {
  if (tool === "get_my_history" || tool === "recall_conversation") return;
  const a = A();
  a.push({ t: Date.now(), tool, args: JSON.stringify(args || {}).slice(0, 160), ok: !!res.ok, error: res.ok ? undefined : String(res.error || "failed").slice(0, 200), by });
  if (a.length > MAX_A) a.splice(0, a.length - MAX_A);
  save(A_KEY, a);
}

export function logTalk(who: "you" | "ai", text: string) {
  const s = text.trim();
  if (!s) return;
  const t = T();
  const last = t[t.length - 1];
  if (last && last.who === who && Date.now() - last.t < 4000) { last.text = (last.text + " " + s).slice(-600); last.t = Date.now(); }
  else t.push({ t: Date.now(), who, text: s.slice(0, 600) });
  if (t.length > MAX_T) t.splice(0, t.length - MAX_T);
  save(T_KEY, t);
}

export function actionHistory(o: { minutes?: number; failed?: boolean; tool?: string; limit?: number; loops?: boolean }) {
  const since = Date.now() - Math.min(60 * 24 * 30, Math.max(1, Number(o.minutes) || 60 * 24 * 7)) * 60_000;
  let list = A().filter((r) => r.t >= since);
  if (!o.loops) list = list.filter((r) => r.by === "agent");
  if (o.tool) list = list.filter((r) => r.tool === o.tool);
  const all = list;
  if (o.failed) list = list.filter((r) => !r.ok);
  const lim = Math.min(80, Math.max(1, Number(o.limit) || 25));
  const by: Record<string, { ok: number; failed: number }> = {};
  all.forEach((r) => { const b = (by[r.tool] ||= { ok: 0, failed: 0 }); r.ok ? b.ok++ : b.failed++; });
  const ago = (t: number) => `${Math.round((Date.now() - t) / 60_000)} min ago`;
  return {
    total: all.length, failed: all.filter((r) => !r.ok).length,
    changes: all.filter((r) => r.ok && !READS.test(r.tool)).slice(-15).map((r) => ({ when: ago(r.t), tool: r.tool, args: r.args })),
    by_tool: by,
    recent: list.slice(-lim).map((r) => ({ when: ago(r.t), tool: r.tool, args: r.args, ok: r.ok, error: r.error })),
  };
}

export function recall(o: { query?: string; limit?: number }) {
  const q = String(o.query || "").toLowerCase().split(/\s+/).filter(Boolean);
  let list = T();
  if (q.length) list = list.filter((r) => q.some((w) => r.text.toLowerCase().includes(w)));
  const lim = Math.min(60, Math.max(1, Number(o.limit) || 20));
  return list.slice(-lim).map((r) => ({ when: new Date(r.t).toISOString().slice(0, 16).replace("T", " "), who: r.who, text: r.text }));
}

/** The last few exchanges, for the opening brief of a fresh session. */
export function memoryBrief() {
  const t = T().slice(-12);
  const f = A().filter((r) => r.by === "agent" && !r.ok).slice(-3);
  if (!t.length && !f.length) return "";
  const out = ["MEMORY FROM EARLIER VISITS (use recall_conversation and get_my_history for more):"];
  t.forEach((r) => out.push(`${r.who === "you" ? "Person" : "You"}: ${r.text.slice(0, 160)}`));
  if (f.length) out.push("Recent failures: " + f.map((r) => `${r.tool} (${r.error})`).join("; "));
  return out.join("\n");
}

// Loops: repeat a tool on an interval, with no limit on how long they run while the page is open.
export type LoopCond = { path: string; op: "eq" | "ne" | "gt" | "lt" | "contains" | "changes"; value?: unknown };
export type Loop = { id: string; tool: string; args: Record<string, unknown>; every_s: number; until?: LoopCond; max_runs?: number; note?: string; runs: number; started: number; last?: unknown; lastAt?: number; timer?: ReturnType<typeof setInterval> };
export type LoopEvent = { loop: string; tool: string; kind: "hit" | "change" | "done" | "error"; text: string };

const loops = new Map<string, Loop>();
const L_KEY = "po.agent.loops.v1";
let runner: ((tool: string, args: Record<string, unknown>) => Promise<{ ok: boolean; [k: string]: unknown }>) | null = null;
const listeners = new Set<(e: LoopEvent) => void>();

export const setLoopRunner = (f: typeof runner) => { runner = f; };
export function onLoopEvent(f: (e: LoopEvent) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
const emit = (e: LoopEvent) => listeners.forEach((f) => f(e));

function persistLoops() {
  if (typeof sessionStorage === "undefined") return;
  try { sessionStorage.setItem(L_KEY, JSON.stringify([...loops.values()].map(({ timer, last, ...l }) => l))); } catch { /* blocked */ }
}

function pick(v: unknown, path: string): unknown {
  return path.split(".").filter(Boolean).reduce<any>((o, k) => (o == null ? undefined : Array.isArray(o) && /^\d+$/.test(k) ? o[+k] : o[k]), v);
}
function test(c: LoopCond, now: unknown, before: unknown): boolean {
  switch (c.op) {
    case "eq": return String(now) === String(c.value);
    case "ne": return String(now) !== String(c.value);
    case "gt": return Number(now) > Number(c.value);
    case "lt": return Number(now) < Number(c.value);
    case "contains": return String(JSON.stringify(now)).toLowerCase().includes(String(c.value).toLowerCase());
    case "changes": return before !== undefined && JSON.stringify(now) !== JSON.stringify(before);
  }
}

async function tick(l: Loop) {
  if (!runner) return;
  l.runs++;
  let res: { ok: boolean; [k: string]: unknown };
  try { res = await runner(l.tool, l.args); } catch (e) { res = { ok: false, error: String(e) }; }
  if (!res.ok) {
    if (l.runs > 2 && !l.lastAt) { stopLoop(l.id); emit({ loop: l.id, tool: l.tool, kind: "error", text: `failed and stopped: ${res.error}` }); }
    return;
  }
  l.lastAt = Date.now();
  const val = l.until ? pick(res, l.until.path) : undefined;
  if (l.until && test(l.until, val, l.last)) {
    emit({ loop: l.id, tool: l.tool, kind: l.until.op === "changes" ? "change" : "hit", text: `${l.until.path} is now ${JSON.stringify(val)?.slice(0, 200)}${l.note ? ` (${l.note})` : ""}` });
    if (l.until.op !== "changes") { stopLoop(l.id); return; }
  }
  if (l.until) l.last = val;
  if (l.max_runs && l.runs >= l.max_runs) { stopLoop(l.id); emit({ loop: l.id, tool: l.tool, kind: "done", text: `ran ${l.runs} times; last result ${JSON.stringify(res).slice(0, 300)}` }); }
}

export function startLoop(o: Omit<Loop, "id" | "runs" | "started">, id?: string): Loop {
  const l: Loop = { ...o, every_s: Math.min(3600, Math.max(2, Number(o.every_s) || 10)), id: id || `loop${Date.now().toString(36).slice(-5)}`, runs: 0, started: Date.now() };
  l.timer = setInterval(() => void tick(l), l.every_s * 1000);
  loops.set(l.id, l);
  persistLoops();
  void tick(l);
  return l;
}
export function stopLoop(id: string) { const l = loops.get(id); if (!l) return false; clearInterval(l.timer); loops.delete(id); persistLoops(); return true; }
export function stopAllLoops() { const n = loops.size; [...loops.keys()].forEach(stopLoop); return n; }
export const listLoops = () => [...loops.values()].map((l) => ({ id: l.id, tool: l.tool, args: l.args, every_s: l.every_s, until: l.until, runs: l.runs, running_min: Math.round((Date.now() - l.started) / 60000), note: l.note }));

/** After a refresh, bring back the loops that were running in this tab. */
export function restoreLoops() {
  if (typeof sessionStorage === "undefined" || loops.size) return 0;
  let saved: Loop[] = [];
  try { saved = JSON.parse(sessionStorage.getItem(L_KEY) || "[]"); } catch { /* none */ }
  saved.forEach((l) => startLoop({ tool: l.tool, args: l.args, every_s: l.every_s, until: l.until, max_runs: l.max_runs, note: l.note }, l.id));
  return saved.length;
}
