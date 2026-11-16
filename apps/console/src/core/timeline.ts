import { useSyncExternalStore } from "react";
import { allSessions, isActive } from "./harness";

// One sample per second of every session, kept for 15 minutes. Charts read from here so the
// history survives switching views, and every view shares the same clock.

export type Sample = {
  t: number;
  live: number;
  rate: number;
  records: number;
  granted: number;
  blocked: number;
  /** Records added in this second, per scope id. */
  per: Record<string, number>;
};

export type Mark = { t: number; scope: string; kind: "granted" | "denied" | "stopped" | "error" | "first"; msg: string };

const KEEP = 3600; // one hour at one sample per second
let samples: Sample[] = [];
const last = new Map<string, number>();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
const everGranted = new Set<string>();
const everBlocked = new Set<string>();

function tick() {
  let live = 0, rate = 0, records = 0;
  const per: Record<string, number> = {};
  for (const s of allSessions()) {
    if (isActive(s)) live++;
    if (s.state === "granted" || s.state === "streaming" || s.firstAt) everGranted.add(s.id);
    if (s.state === "denied" || s.state === "unsupported" || s.state === "error") everBlocked.add(s.id);
    records += s.count;
    const prev = last.get(s.id) ?? 0;
    // A restarted session resets its count, so a drop means a fresh run.
    const d = s.count >= prev ? s.count - prev : s.count;
    if (d > 0) { per[s.id] = d; rate += d; }
    last.set(s.id, s.count);
  }
  samples = [...samples.slice(-(KEEP - 1)), { t: Date.now(), live, rate, records, granted: everGranted.size, blocked: everBlocked.size, per }];
  subs.forEach((f) => f());
}

export function startTimeline() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 1000);
}

export function useTimeline(): Sample[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => samples);
}

/** The latest n samples without subscribing, for metrics computed during render. */
export const recent = (n: number) => samples.slice(-n);
export const grantedIds = () => [...everGranted];
export const blockedIds = () => [...everBlocked];

const KIND: [RegExp, Mark["kind"]][] = [
  [/granted/, "granted"], [/first record/, "first"], [/stopped/, "stopped"],
];

/** Notable events from every session log, newest first. */
export function marks(): Mark[] {
  const out: Mark[] = [];
  for (const s of allSessions()) {
    for (const l of s.logs) {
      let kind: Mark["kind"] | undefined;
      if (l.level === "warn") kind = "denied";
      else if (l.level === "err") kind = "error";
      else kind = KIND.find(([re]) => re.test(l.msg))?.[1];
      if (kind) out.push({ t: l.t, scope: s.id, kind, msg: l.msg });
    }
  }
  return out.sort((a, b) => b.t - a.t);
}

/** Every log line from every session, newest first. */
export function feed() {
  return allSessions().flatMap((s) => s.logs.map((l) => ({ ...l, scope: s.id }))).sort((a, b) => b.t - a.t);
}
