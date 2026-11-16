import type { Profile } from "../browser/profile";
import type { PassiveSignal } from "../real/types";
import type { Rec, Session, Source } from "./types";
import { addTap } from "./harness";

// Sends every reading, log step and capture summary to /api/ingest in small batches.
// The server removes personal content before anything is stored (see api/ingest.mjs).
// It never blocks the console: failures back off quietly, and a missing or unconfigured
// endpoint (404 or 503) turns uploading off for this tab.

const URL_INGEST = "/api/ingest";
const EVERY_MS = 5000;
const PER_SCOPE_HZ = 50;
const MAX_READINGS = 200; // samples per batch
const MAX_EVENTS = 500;
const MAX_CAPTURES = 50;
const MAX_BYTES = 500_000; // under the 512 KB server limit
const BEACON_BYTES = 60_000; // sendBeacon payloads are capped near 64 KB
const QUEUE_CAP = 5000; // oldest samples drop first if the network is down for long

/** Media scopes send only scalar facts (size, rate, loudness). Never pixels, waveforms or spectra. */
const MEDIA = new Set(["capture.camera", "capture.microphone", "capture.screen"]);

type Sample = { scope: string; source: Source; seq: number; t: number; data: Record<string, unknown> };
type Event = { scope: string; t: number; level: Session["logs"][number]["level"]; state: Session["state"]; msg: string };
export type Capture = {
  scope: string; t: number; kind: "image" | "audio" | "video" | "text" | "file" | "other";
  mime: string; bytes: number; width?: number; height?: number; duration_ms?: number; sha256?: string;
};

let samples: Sample[] = [];
let events: Event[] = [];
let captures: Capture[] = [];
const seen = new Set<string>();
const rate = new Map<string, { sec: number; n: number }>();

let visit: Record<string, unknown> | null = null;
let visitSent = false;
let visitWaitUntil = 0;
let off = false;
let busy = false;
let backoffUntil = 0;
let backoffMs = 0;
let started = false;

function visitId(): string {
  const make = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
  try {
    let v = sessionStorage.getItem("po.visit");
    if (!v) { v = make(); sessionStorage.setItem("po.visit", v); }
    return v;
  } catch {
    return make();
  }
}
const VISIT_ID = visitId();

function scalars(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 120) || v === null) out[k] = v;
  return out;
}

function onRecord(scope: string, source: Source, rec: Rec) {
  if (off) return;
  const key = `${scope}:${source}:${rec.t}:${rec.seq}`;
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 20000) seen.clear();
  const sec = Math.floor(rec.t / 1000);
  const r = rate.get(scope);
  if (r && r.sec === sec) { if (r.n >= PER_SCOPE_HZ) return; r.n++; } else rate.set(scope, { sec, n: 1 });
  const data = MEDIA.has(scope) ? scalars(rec.data) : rec.data;
  samples.push({ scope, source, seq: rec.seq, t: rec.t, data });
  if (samples.length > QUEUE_CAP) samples = samples.slice(-QUEUE_CAP);
  if (samples.length >= MAX_READINGS) void flush();
}

function onLog(scope: string, e: Session["logs"][number], state: Session["state"]) {
  if (off) return;
  events.push({ scope, t: e.t, level: e.level, state, msg: e.msg });
  if (events.length > QUEUE_CAP) events = events.slice(-QUEUE_CAP);
}

/** Record that something was captured. Only its size and type are sent, plus a hash of the bytes. */
export async function addCapture(c: Omit<Capture, "t" | "sha256" | "bytes">, blob?: Blob) {
  if (off) return;
  let sha256: string | undefined;
  try {
    if (blob && crypto.subtle) {
      const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      sha256 = [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* the hash is optional */ }
  captures.push({ ...c, t: Date.now(), bytes: blob?.size ?? 0, sha256 });
  if (captures.length > 500) captures = captures.slice(-500);
}

/** Device and browser details, sent once with the first batch of this tab. */
export function setVisit(profile: Profile, passive: PassiveSignal[] | null) {
  visit = {
    site: location.host, brand: profile.brand, version: profile.version, engine: profile.engine,
    os: profile.os, device: profile.device, ua: navigator.userAgent, profile, passive: passive || [],
  };
  if (passive) visitWaitUntil = 0;
}

type Batch = { visit_id: string; visit?: Record<string, unknown>; readings: { scope: string; source: Source; samples: { seq: number; t: number; data: Record<string, unknown> }[] }[]; events: Event[]; captures: Capture[] };

function group(list: Sample[]): Batch["readings"] {
  const m = new Map<string, Batch["readings"][number]>();
  for (const s of list) {
    const k = s.scope + "|" + s.source;
    let g = m.get(k);
    if (!g) { g = { scope: s.scope, source: s.source, samples: [] }; m.set(k, g); }
    g.samples.push({ seq: s.seq, t: s.t, data: s.data });
  }
  return [...m.values()];
}

/** Take items off the queues into one batch that fits `limit` bytes. Returns null if empty. */
function take(limit: number): { batch: Batch; body: string; put: () => void } | null {
  const withVisit = !visitSent && !!visit;
  let ns = Math.min(samples.length, MAX_READINGS), ne = Math.min(events.length, MAX_EVENTS), nc = Math.min(captures.length, MAX_CAPTURES);
  if (!ns && !ne && !nc && !withVisit) return null;
  for (;;) {
    const s = samples.slice(0, ns), e = events.slice(0, ne), c = captures.slice(0, nc);
    const batch: Batch = { visit_id: VISIT_ID, readings: group(s), events: e, captures: c };
    if (withVisit) batch.visit = visit!;
    const body = JSON.stringify(batch);
    if (body.length <= limit || (ns <= 1 && ne <= 1 && nc <= 1)) {
      if (body.length > limit) {
        // A single oversized item cannot be sent: drop it instead of retrying forever.
        samples = samples.slice(ns); events = events.slice(ne); captures = captures.slice(nc);
        return null;
      }
      samples = samples.slice(ns); events = events.slice(ne); captures = captures.slice(nc);
      const put = () => { samples = [...s, ...samples].slice(-QUEUE_CAP); events = [...e, ...events].slice(-QUEUE_CAP); captures = [...c, ...captures]; };
      return { batch, body, put };
    }
    ns = Math.floor(ns / 2); ne = Math.floor(ne / 2); nc = Math.floor(nc / 2);
  }
}

async function flush() {
  if (off || busy || Date.now() < backoffUntil) return;
  if (!visitSent && Date.now() < visitWaitUntil) return; // wait briefly so the first batch carries the device details
  const t = take(MAX_BYTES);
  if (!t) return;
  busy = true;
  try {
    const res = await fetch(URL_INGEST, { method: "POST", headers: { "content-type": "application/json" }, body: t.body });
    if (res.ok) {
      if (t.batch.visit) visitSent = true;
      backoffMs = 0;
    } else if (res.status === 404 || res.status === 503) {
      off = true; samples = []; events = []; captures = [];
    } else if (res.status === 429 || res.status >= 500) {
      t.put();
      backoffMs = Math.min(60_000, backoffMs ? backoffMs * 2 : 5000);
      backoffUntil = Date.now() + backoffMs;
    }
    // Any other status (400, 413) means the batch itself was refused: drop it.
  } catch {
    t.put();
    backoffMs = Math.min(60_000, backoffMs ? backoffMs * 2 : 5000);
    backoffUntil = Date.now() + backoffMs;
  } finally {
    busy = false;
  }
}

/** Last chance when the tab is hidden or closed: hand what fits to sendBeacon. */
function beacon() {
  if (off || !navigator.sendBeacon) return;
  for (let i = 0; i < 4; i++) {
    const t = take(BEACON_BYTES);
    if (!t) return;
    const ok = navigator.sendBeacon(URL_INGEST, new Blob([t.body], { type: "application/json" }));
    if (!ok) { t.put(); return; }
    if (t.batch.visit) visitSent = true;
  }
}

export function startUploader() {
  if (started || typeof window === "undefined") return;
  started = true;
  visitWaitUntil = Date.now() + 15_000;
  addTap({ record: onRecord, log: onLog });
  window.setInterval(() => void flush(), EVERY_MS);
  window.addEventListener("pagehide", beacon);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") beacon(); });
}

/** For the privacy notice: whether this tab is still uploading. */
export const uploading = () => !off;
