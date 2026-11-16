import { useSyncExternalStore } from "react";
import type { Ctx, Params, Rec, ScopeDef, Session, Source, Stop } from "./types";
import { loadAll, persist } from "./history";

// The harness: one store, one request/stop surface for every scope. Adapters push normalized
// records through ctx.emit; the console only ever reads sessions from here.

const MAX = 3000; // raw records kept per session; older data lives in the 1 s rollups in ui/trade.tsx
const sessions = new Map<string, Session>();
const stops = new Map<string, Stop>();
const subs = new Set<() => void>();
/** Listeners that see every record and log entry as it happens (the uploader uses this). */
export type Tap = {
  record?: (scope: string, source: Source, rec: Rec) => void;
  log?: (scope: string, entry: Session["logs"][number], state: Session["state"]) => void;
};
const taps = new Set<Tap>();
export function addTap(t: Tap) { taps.add(t); return () => { taps.delete(t); }; }
let version = 0;
let scopes: Record<string, ScopeDef> = {};

export function registerScopes(list: ScopeDef[]) {
  scopes = Object.fromEntries(list.map((s) => [s.id, s]));
}

function defaults(s: ScopeDef): Params {
  return Object.fromEntries((s.params || []).map((p) => [p.key, p.value]));
}

function blank(id: string): Session {
  const s = scopes[id];
  return {
    id, state: "idle", source: "live", params: s ? defaults(s) : {}, records: [], last: null, count: 0,
    startedAt: 0, firstAt: 0, hz: 0, media: null, error: "", logs: [], permState: "", version: 0,
  };
}

let pending = false;
function notify() {
  if (pending) return;
  pending = true;
  // Animation frames pause in background tabs, so a timer backs them up.
  const flush = () => {
    if (!pending) return;
    pending = false;
    version++;
    subs.forEach((f) => f());
  };
  requestAnimationFrame(flush);
  setTimeout(flush, 60);
}

function patch(id: string, p: Partial<Session>) {
  const cur = sessions.get(id) || blank(id);
  sessions.set(id, { ...cur, ...p, version: cur.version + 1 });
  notify();
}

/** Put a returning visitor's saved readings back into idle sessions so the console is not blank. */
export async function restoreSaved(): Promise<number> {
  const all = await loadAll();
  let n = 0;
  all.forEach((rows, id) => {
    if (!scopes[id] || !rows.length) return;
    const cur = getSession(id);
    if (cur.state !== "idle" || cur.records.length) return;
    const records: Rec[] = rows.slice(-MAX).map((r, i) => ({ seq: i + 1, t: r.t, data: r.data }));
    const last = records[records.length - 1];
    patch(id, { records, last, count: records.length, restoredAt: last.t });
    n++;
  });
  return n;
}

export function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) { s = blank(id); sessions.set(id, s); }
  return s;
}

export function allSessions(): Session[] {
  return [...sessions.values()];
}

function log(id: string, msg: string, level: Session["logs"][number]["level"] = "info") {
  const cur = getSession(id);
  const entry = { t: Date.now(), msg, level };
  const logs = [...cur.logs, entry].slice(-80);
  patch(id, { logs });
  taps.forEach((x) => { try { x.log?.(id, entry, getSession(id).state); } catch { /* a tap never breaks the console */ } });
}

export function setParam(id: string, key: string, value: Params[string]) {
  const cur = getSession(id);
  patch(id, { params: { ...cur.params, [key]: value } });
}

export function setSource(id: string, source: Source) {
  const cur = getSession(id);
  if (cur.source === source) return;
  const wasRunning = cur.state === "streaming" || cur.state === "granted" || cur.state === "requesting";
  stop(id, true);
  patch(id, { source });
  if (wasRunning) void request(id);
}

export async function queryPermission(id: string) {
  const s = scopes[id];
  if (!s || !s.permission || !navigator.permissions) return;
  try {
    const st = await navigator.permissions.query({ name: s.permission as PermissionName });
    patch(id, { permState: st.state });
    st.onchange = () => patch(id, { permState: st.state });
  } catch {
    patch(id, { permState: "not queryable" });
  }
}

function explain(e: unknown): { state: Session["state"]; msg: string } {
  const err = e as { name?: string; message?: string };
  const name = err?.name || "Error";
  const m = err?.message || String(e);
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || /denied|dismissed|not allowed/i.test(m)) return { state: "denied", msg: `Refused: ${m}` };
  if (name === "NotSupportedError" || name === "Unsupported" || /not supported|unsupported|not available/i.test(m)) return { state: "unsupported", msg: m };
  if (name === "NotFoundError" || name === "AbortError") return { state: "stopped", msg: `Nothing chosen: ${m}` };
  return { state: "error", msg: `${name}: ${m}` };
}

/** Start a scope. Same call for every capability. */
export async function request(id: string) {
  const s = scopes[id];
  if (!s) return;
  stop(id, true);
  const cur = getSession(id);
  const source = cur.source;
  const t0 = performance.now();
  let seq = 0;
  let windowStart = performance.now();
  let windowCount = 0;
  let hz = 0;
  let records: Rec[] = [];
  let alive = true;
  patch(id, { state: "requesting", records: [], last: null, count: 0, startedAt: Date.now(), firstAt: 0, hz: 0, error: "", media: null, restoredAt: undefined });
  log(id, `request ${s.id} (${source === "live" ? "live browser" : "simulated"})`);

  const ctx: Ctx = {
    params: { ...cur.params },
    granted: () => {
      if (!alive) return;
      const now = getSession(id);
      if (now.state === "requesting") {
        patch(id, { state: "granted" });
        log(id, source === "live" ? `access granted after ${Math.round(performance.now() - t0)} ms` : "simulated access granted", "ok");
      }
    },
    emit: (data) => {
      if (!alive) return;
      const now = performance.now();
      windowCount++;
      if (now - windowStart > 1000) {
        hz = (windowCount * 1000) / (now - windowStart);
        windowStart = now;
        windowCount = 0;
      }
      const rec: Rec = { seq: ++seq, t: Date.now(), data };
      records = records.length >= MAX ? [...records.slice(-MAX + 1), rec] : [...records, rec];
      const prev = getSession(id);
      const first = prev.firstAt || Date.now();
      if (prev.state !== "streaming") log(id, `first record after ${Math.round(now - t0)} ms`, "ok");
      patch(id, { state: "streaming", records, last: rec, count: seq, hz, firstAt: first });
      persist(id, rec);
      taps.forEach((x) => { try { x.record?.(id, source, rec); } catch { /* ignore */ } });
    },
    setMedia: (m) => alive && patch(id, { media: m }),
    log: (msg) => alive && log(id, msg),
  };

  try {
    const st = source === "live" ? await s.live(ctx) : s.sim(ctx);
    const fn = () => {
      alive = false;
      try {
        st && st();
      } catch {
        /* ignore */
      }
    };
    stops.set(id, fn);
    const now = getSession(id);
    if (now.state === "requesting") patch(id, { state: "granted" });
  } catch (e) {
    alive = false;
    const x = explain(e);
    patch(id, { state: x.state, error: x.msg });
    log(id, x.msg, x.state === "denied" ? "warn" : "err");
  }
  void queryPermission(id);
}

export function stop(id: string, silent = false) {
  const fn = stops.get(id);
  if (fn) {
    fn();
    stops.delete(id);
  }
  const cur = sessions.get(id);
  if (cur && cur.media) cur.media.getTracks().forEach((t) => t.stop());
  if (cur && !silent && ["streaming", "granted", "requesting"].includes(cur.state)) {
    patch(id, { state: "stopped", media: null });
    log(id, `stopped after ${cur.count} records`);
  } else if (cur) patch(id, { media: null });
}

export function stopAll() {
  [...stops.keys()].forEach((id) => stop(id));
}

export function isActive(s: Session) {
  return s.state === "streaming" || s.state === "granted" || s.state === "requesting";
}

export function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}

export function useSession(id: string): Session {
  return useSyncExternalStore(subscribe, () => getSession(id));
}

export function useVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Small helpers for adapters. */
export function every(ms: number, fn: () => void): Stop {
  fn();
  const h = setInterval(fn, ms);
  return () => clearInterval(h);
}

export function unsupported(what: string): never {
  const e = new Error(`${what} is not supported in this browser`);
  e.name = "NotSupportedError";
  throw e;
}

export function series(records: Rec[], key: string, n = 120): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, records.length - n); i < records.length; i++) {
    const v = records[i].data[key];
    if (typeof v === "number" && isFinite(v)) out.push(v);
  }
  return out;
}

export const noise = (amp = 1) => (Math.random() - 0.5) * 2 * amp;
