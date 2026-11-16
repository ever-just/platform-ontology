import { useEffect, useRef } from "react";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { every, noise, series, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Readout, Scope, Waiting, lastData } from "../ui/kit";
import "./place-motion-link.css";

// How you move: tilt, shake, pointer and typing rhythm, and attention. Mostly silent signals.

const COLOR = DOMAIN_COLOR.motion;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** iOS gates motion and orientation behind a prompt that must come from a click. */
export async function askSensor(kind: "DeviceOrientationEvent" | "DeviceMotionEvent") {
  const E = (window as any)[kind];
  if (!E) unsupported(kind);
  if (typeof E.requestPermission === "function") {
    const r = await E.requestPermission();
    if (r !== "granted") throw new DOMException("Motion and orientation access was refused", "NotAllowedError");
  }
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// ---------- Orientation ----------

type OriRec = { alpha: number; beta: number; gamma: number; absolute: boolean };

async function oriLive(ctx: Ctx): Promise<Stop> {
  await askSensor("DeviceOrientationEvent");
  ctx.granted();
  let last = 0;
  let got = false;
  const on = (e: DeviceOrientationEvent) => {
    if (e.alpha === null && e.beta === null && e.gamma === null) return;
    const now = performance.now();
    if (now - last < 40) return;
    last = now;
    got = true;
    ctx.emit({ alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0, absolute: e.absolute });
  };
  window.addEventListener("deviceorientation", on);
  const t = setTimeout(() => !got && ctx.log("no orientation data arrived: this device has no tilt sensor. Try Simulated."), 3000);
  return () => { clearTimeout(t); window.removeEventListener("deviceorientation", on); };
}

function oriSim(ctx: Ctx): Stop {
  ctx.granted();
  return every(40, () => {
    const t = Date.now() / 1000;
    ctx.emit({ alpha: (t * 12) % 360, beta: 35 * Math.sin(t * 0.7) + noise(0.6), gamma: 28 * Math.sin(t * 0.45 + 1) + noise(0.6), absolute: false });
  });
}

function Orientation({ session }: InstrumentProps) {
  const d = lastData<OriRec>(session);
  const { alpha = 0, beta = 0, gamma = 0 } = d || {};
  return (
    <Frame
      visual={d ? (
        <div className="pml-orient-wrap">
          <div className="pml-phone-stage">
            <div className="pml-phone" style={{ transform: `rotateZ(${-alpha}deg) rotateX(${beta}deg) rotateY(${gamma}deg)` }}><div className="pml-phone-axes" /></div>
          </div>
          <Scope min={-180} max={360} series={[
            { label: "alpha", values: series(session.records, "alpha"), color: COLOR },
            { label: "beta", values: series(session.records, "beta"), color: C.accent },
            { label: "gamma", values: series(session.records, "gamma"), color: C.ok },
          ]} />
        </div>
      ) : <Waiting session={session} what="A phone model that tilts as you tilt the device, with the three angles traced live." />}
      side={<Readout rows={[
        { k: "alpha (compass turn)", v: d?.alpha ?? null, u: "deg", digits: 1, hot: true },
        { k: "beta (front to back)", v: d?.beta ?? null, u: "deg", digits: 1 },
        { k: "gamma (left to right)", v: d?.gamma ?? null, u: "deg", digits: 1 },
        { k: "Absolute frame", v: d?.absolute ?? null },
        { k: "Rate", v: session.hz, u: "Hz", digits: 0 },
      ]} />}
    />
  );
}

// ---------- Accelerometer ----------

type AccRec = { ax: number; ay: number; az: number; ra: number; rb: number; rg: number; mag: number; peak: number; steps: number };

/** Count a step each time shake strength crosses a threshold, with a 300 ms refractory gap. */
function stepper() {
  let steps = 0, lastStep = 0, above = false, peak = 0;
  return (mag: number, now: number) => {
    peak = Math.max(peak, mag);
    if (mag > 2.2 && !above && now - lastStep > 300) { steps++; lastStep = now; above = true; }
    if (mag < 1.2) above = false;
    return { steps, peak };
  };
}

async function accLive(ctx: Ctx): Promise<Stop> {
  await askSensor("DeviceMotionEvent");
  ctx.granted();
  const step = stepper();
  let last = 0;
  let got = false;
  const on = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    const r = e.rotationRate;
    const src = a && a.x !== null ? a : g;
    if (!src || src.x === null) return;
    const now = performance.now();
    if (now - last < 40) return;
    last = now;
    got = true;
    const ax = src.x ?? 0, ay = src.y ?? 0, az = src.z ?? 0;
    const mag = a && a.x !== null ? Math.hypot(ax, ay, az) : Math.abs(Math.hypot(ax, ay, az) - 9.81);
    const s = step(mag, now);
    ctx.emit({ ax, ay, az, ra: r?.alpha ?? 0, rb: r?.beta ?? 0, rg: r?.gamma ?? 0, mag, peak: s.peak, steps: s.steps });
  };
  window.addEventListener("devicemotion", on);
  const t = setTimeout(() => !got && ctx.log("no motion data arrived: this device has no accelerometer. Try Simulated."), 3000);
  return () => { clearTimeout(t); window.removeEventListener("devicemotion", on); };
}

function accSim(ctx: Ctx): Stop {
  ctx.granted();
  const step = stepper();
  return every(40, () => {
    const t = Date.now() / 1000;
    const bounce = Math.max(0, Math.sin(t * 2 * Math.PI * 1.9)) ** 2 * 3.4;
    const ax = noise(0.4) + Math.sin(t * 3.8) * 0.9, ay = noise(0.4) + bounce * 0.4, az = noise(0.4) + bounce;
    const mag = Math.hypot(ax, ay, az);
    const s = step(mag, performance.now());
    ctx.emit({ ax, ay, az, ra: 30 * Math.sin(t * 3.8) + noise(6), rb: 22 * Math.cos(t * 1.9) + noise(6), rg: 12 * Math.sin(t * 1.9 + 1) + noise(4), mag, peak: s.peak, steps: s.steps });
  });
}

function Accelerometer({ session }: InstrumentProps) {
  const d = lastData<AccRec>(session);
  const R = session.records;
  return (
    <Frame
      visual={d ? (
        <div className="pml-scopes">
          <div>
            <h5>Acceleration (m/s2)</h5>
            <Scope series={[
              { label: "x", values: series(R, "ax"), color: C.err },
              { label: "y", values: series(R, "ay"), color: C.ok },
              { label: "z", values: series(R, "az"), color: C.accent },
            ]} />
          </div>
          <div>
            <h5>Rotation rate (deg/s)</h5>
            <Scope series={[
              { label: "alpha", values: series(R, "ra"), color: COLOR },
              { label: "beta", values: series(R, "rb"), color: C.warn },
              { label: "gamma", values: series(R, "rg"), color: C.ink2 },
            ]} />
          </div>
        </div>
      ) : <Waiting session={session} what="Two oscilloscopes: how hard the device is pushed, and how fast it is turning." />}
      side={<Readout rows={[
        { k: "Magnitude", v: d?.mag ?? null, u: "m/s2", hot: true },
        { k: "Peak", v: d?.peak ?? null, u: "m/s2" },
        { k: "Steps (estimate)", v: d?.steps ?? null, digits: 0 },
        { k: "Rate", v: session.hz, u: "Hz", digits: 0 },
      ]} />}
    />
  );
}

// ---------- Pointer ----------

type PtrRec = { nx: number; ny: number; speed: number; dist: number; clicks: number; idle_ms: number };

function pointerCore(ctx: Ctx, feed: (cb: (x: number, y: number, click: boolean) => void) => Stop): Stop {
  let x = 0, y = 0, px = 0, py = 0, pt = 0, dist = 0, clicks = 0, speed = 0, moved = performance.now(), lastEmit = 0;
  const push = () => {
    const now = performance.now();
    lastEmit = now;
    ctx.emit({ nx: x, ny: y, speed, dist, clicks, idle_ms: now - moved });
  };
  const off = feed((nx, ny, click) => {
    const now = performance.now();
    if (click) { clicks++; push(); return; }
    const ddx = (nx - px) * innerWidth, ddy = (ny - py) * innerHeight;
    const dt = Math.max(1, now - pt);
    if (pt) { const d = Math.hypot(ddx, ddy); dist += d; speed = speed * 0.6 + ((d / dt) * 1000) * 0.4; }
    x = nx; y = ny; px = nx; py = ny; pt = now; moved = now;
    if (now - lastEmit > 30) push();
  });
  const tick = setInterval(() => {
    const now = performance.now();
    if (now - lastEmit > 250) { speed *= 0.5; push(); }
  }, 250);
  return () => { clearInterval(tick); off(); };
}

const ptrLive = async (ctx: Ctx): Promise<Stop> => {
  ctx.granted();
  return pointerCore(ctx, (cb) => {
    const mv = (e: PointerEvent) => cb(e.clientX / innerWidth, e.clientY / innerHeight, false);
    const dn = () => cb(0, 0, true);
    window.addEventListener("pointermove", mv, { passive: true });
    window.addEventListener("pointerdown", dn, { passive: true });
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerdown", dn); };
  });
};

function ptrSim(ctx: Ctx): Stop {
  ctx.granted();
  return pointerCore(ctx, (cb) => {
    const h = setInterval(() => {
      const t = Date.now() / 1000;
      const burst = 0.5 + 0.5 * Math.sin(t * 0.6);
      const nx = 0.5 + 0.38 * Math.sin(t * 0.9 * burst + Math.sin(t * 0.3)) + noise(0.004);
      const ny = 0.5 + 0.34 * Math.sin(t * 1.3 * burst + 1.2) + noise(0.004);
      if (burst > 0.08) cb(nx, ny, false);
      if (Math.random() < 0.02) cb(0, 0, true);
    }, 16);
    return () => clearInterval(h);
  });
}

function Pointer({ session }: InstrumentProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const d = lastData<PtrRec>(session);
  const recs = session.records;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth || 600, h = cv.clientHeight || 360;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "#ececef"; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo((w / 6) * i, 0); g.lineTo((w / 6) * i, h); g.stroke(); }
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (h / 4) * i); g.lineTo(w, (h / 4) * i); g.stroke(); }
    const pts = recs.slice(-300).map((r) => r.data as unknown as PtrRec);
    g.lineCap = "round";
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!b.speed && !a.speed) continue;
      const f = Math.min(1, b.speed / 1800);
      g.strokeStyle = `hsl(${250 - f * 230}, 75%, 52%)`;
      g.globalAlpha = 0.25 + 0.75 * (i / pts.length);
      g.lineWidth = 1.2 + f * 2.2;
      g.beginPath(); g.moveTo(a.nx * w, a.ny * h); g.lineTo(b.nx * w, b.ny * h); g.stroke();
    }
    g.globalAlpha = 1;
    const l = pts[pts.length - 1];
    if (l) { g.fillStyle = C.ink; g.beginPath(); g.arc(l.nx * w, l.ny * h, 4, 0, 7); g.fill(); }
  }, [recs]);
  return (
    <Frame
      visual={
        <div className="pml-vis" style={{ justifyContent: "flex-start", gap: 0 }}>
          <canvas ref={ref} className="pml-canvas" />
          {!d && <Waiting session={session} what="Move the pointer anywhere on the page. A trail is drawn, colored by speed." />}
          <div className="pml-note" style={{ padding: 6 }}>Blue is slow, red is fast. How you move a mouse is as personal as handwriting: it can recognise you across sessions.</div>
        </div>
      }
      side={<Readout rows={[
        { k: "Speed", v: d?.speed ?? null, u: "px/s", digits: 0, hot: true },
        { k: "Distance", v: d?.dist ?? null, u: "px", digits: 0 },
        { k: "Clicks", v: d?.clicks ?? null, digits: 0 },
        { k: "Idle", v: d?.idle_ms ?? null, u: "ms", digits: 0 },
      ]} />}
    />
  );
}

// ---------- Keystroke timing ----------

type KeyRec = { dwell: number; flight: number | null; mean_dwell: number | null; mean_flight: number | null; kpm: number; keys: number };

function keyCore(ctx: Ctx, feed: (down: () => void, up: () => void) => Stop): Stop {
  // Only times are kept. The key value is never read.
  const dwells: number[] = [], flights: number[] = [], stamps: number[] = [];
  let downAt = 0, upAt = 0, keys = 0, flight: number | null = null;
  const off = feed(
    () => { const n = performance.now(); if (!downAt || downAt <= upAt) { flight = upAt ? n - upAt : null; downAt = n; } },
    () => {
      const n = performance.now();
      if (!downAt) return;
      const dwell = n - downAt;
      upAt = n; keys++; stamps.push(n);
      dwells.push(dwell); if (flight !== null && flight < 2000) flights.push(flight);
      while (stamps.length && n - stamps[0] > 60000) stamps.shift();
      const span = Math.max(5000, Math.min(60000, n - (stamps[0] || n)));
      ctx.emit({ dwell, flight, mean_dwell: mean(dwells.slice(-50)), mean_flight: mean(flights.slice(-50)), kpm: (stamps.length / span) * 60000, keys });
    },
  );
  return off;
}

const keyLive = async (ctx: Ctx): Promise<Stop> => {
  ctx.granted();
  return keyCore(ctx, (down, up) => {
    const d = (e: KeyboardEvent) => { if (!e.repeat) down(); };
    window.addEventListener("keydown", d, true);
    window.addEventListener("keyup", up, true);
    return () => { window.removeEventListener("keydown", d, true); window.removeEventListener("keyup", up, true); };
  });
};

function keySim(ctx: Ctx): Stop {
  ctx.granted();
  let alive = true;
  const next = () => {
    if (!alive) return;
    keyCore(ctx, (down, up) => {
      let n = 0;
      const type = () => {
        if (!alive) return;
        if (n++ > 25) { n = 0; setTimeout(type, 1500); return; }
        down();
        setTimeout(() => { up(); setTimeout(type, 40 + Math.random() * 130); }, 60 + Math.random() * 70);
      };
      type();
      return () => {};
    });
  };
  next();
  return () => { alive = false; };
}

function Keystroke({ session }: InstrumentProps) {
  const d = lastData<KeyRec>(session);
  const recs = session.records.slice(-40).map((r) => r.data as unknown as KeyRec);
  const top = Math.max(200, ...recs.map((r) => Math.max(r.dwell, r.flight ?? 0)));
  return (
    <Frame
      visual={
        <div className="pml-vis">
          <input className="pml-input" placeholder="Type here: only timing is measured, never which key" spellCheck={false} autoComplete="off" />
          {d ? (
            <>
              <div className="pml-bars">
                {recs.map((r, i) => (
                  <div key={i}>
                    <i style={{ height: `${((r.flight ?? 0) / top) * 100}%`, background: C.line }} />
                    <i style={{ height: `${(r.dwell / top) * 100}%`, background: COLOR }} />
                  </div>
                ))}
              </div>
              <div className="pml-legend"><span><i style={{ background: COLOR }} />dwell (key held)</span><span><i style={{ background: C.line }} />flight (gap before key)</span></div>
            </>
          ) : <Waiting session={session} what="Type in the box. Bars show how long each key is held and the gap between keys." />}
          <div className="pml-note">Your typing rhythm is a biometric. This instrument stores timing only; key values are never read.</div>
        </div>
      }
      side={<Readout rows={[
        { k: "Mean dwell", v: d?.mean_dwell ?? null, u: "ms", digits: 0, hot: true },
        { k: "Mean flight", v: d?.mean_flight ?? null, u: "ms", digits: 0 },
        { k: "Keys per min", v: d?.kpm ?? null, digits: 0 },
        { k: "Keys timed", v: d?.keys ?? null, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Attention ----------

type AttState = "visible" | "blurred" | "hidden" | "idle";
type Seg = { s: AttState; t0: number; t1: number };
type AttRec = { state: AttState; segs: Seg[]; visible_s: number; hidden_s: number; idle_s: number; switches: number };
const ATT_COLOR: Record<AttState, string> = { visible: "#2da44e", blurred: "#d98a00", hidden: "#c4c4cc", idle: "#8250df" };

function attCore(ctx: Ctx, feed: (set: (s: AttState) => void) => Stop): Stop {
  const segs: Seg[] = [{ s: "visible", t0: Date.now(), t1: Date.now() }];
  let switches = 0;
  const set = (s: AttState) => {
    const l = segs[segs.length - 1];
    if (l.s === s) return;
    l.t1 = Date.now(); switches++;
    segs.push({ s, t0: Date.now(), t1: Date.now() });
    if (segs.length > 60) segs.shift();
  };
  const push = () => {
    const now = Date.now();
    segs[segs.length - 1].t1 = now;
    const sum = (k: AttState) => segs.filter((x) => x.s === k).reduce((a, x) => a + (x.t1 - x.t0), 0) / 1000;
    ctx.emit({ state: segs[segs.length - 1].s, segs: segs.map((x) => ({ ...x })), visible_s: sum("visible"), hidden_s: sum("hidden") + sum("blurred"), idle_s: sum("idle"), switches });
  };
  const off = feed(set);
  const tick = every(500, push);
  return () => { tick(); off(); };
}

const attLive = async (ctx: Ctx): Promise<Stop> => {
  ctx.granted();
  const idleMs = Number(ctx.params.idle_s || 10) * 1000;
  return attCore(ctx, (set) => {
    let lastInput = Date.now();
    const base = (): AttState => (document.visibilityState === "hidden" ? "hidden" : document.hasFocus() ? "visible" : "blurred");
    const sync = () => set(base());
    const poke = () => { lastInput = Date.now(); if (base() === "visible") set("visible"); };
    const watch = setInterval(() => { if (base() === "visible" && Date.now() - lastInput > idleMs) set("idle"); }, 500);
    const ev = ["pointermove", "keydown", "scroll", "touchstart", "wheel"];
    ev.forEach((n) => window.addEventListener(n, poke, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    sync();
    return () => {
      clearInterval(watch);
      ev.forEach((n) => window.removeEventListener(n, poke, true));
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  });
};

function attSim(ctx: Ctx): Stop {
  ctx.granted();
  return attCore(ctx, (set) => {
    const order: AttState[] = ["visible", "idle", "visible", "blurred", "visible", "hidden", "visible"];
    let i = 0, alive = true;
    const go = () => { if (!alive) return; i = (i + 1) % order.length; set(order[i]); setTimeout(go, 2000 + Math.random() * 4000); };
    const h = setTimeout(go, 3000);
    return () => { alive = false; clearTimeout(h); };
  });
}

function Attention({ session }: InstrumentProps) {
  const d = lastData<AttRec>(session);
  const segs = d?.segs || [];
  const t0 = segs.length ? segs[0].t0 : 0;
  const span = Math.max(1, (segs.length ? segs[segs.length - 1].t1 : 0) - t0);
  return (
    <Frame
      visual={
        <div className="pml-vis">
          {d ? (
            <>
              <div className="pml-clock" style={{ color: ATT_COLOR[d.state] }}>{d.state}</div>
              <div className="pml-timeline">
                {segs.map((x, i) => <div key={i} style={{ width: `${((x.t1 - x.t0) / span) * 100}%`, background: ATT_COLOR[x.s], opacity: 0.85 }} title={x.s} />)}
              </div>
              <div className="pml-legend">{(Object.keys(ATT_COLOR) as AttState[]).map((k) => <span key={k}><i style={{ background: ATT_COLOR[k] }} />{k}</span>)}</div>
            </>
          ) : <Waiting session={session} what="A timeline of when you are looking, away, or idle. Switch tabs and come back to see it change." />}
          <div className="pml-note">Sites use this to know when you are reading, when you left, and when to resume a video or send a nudge.</div>
        </div>
      }
      side={<Readout rows={[
        { k: "State", v: d?.state ?? null, hot: true },
        { k: "Visible", v: d?.visible_s ?? null, u: "s", digits: 0 },
        { k: "Away", v: d?.hidden_s ?? null, u: "s", digits: 0 },
        { k: "Idle", v: d?.idle_s ?? null, u: "s", digits: 0 },
        { k: "Switches", v: d?.switches ?? null, digits: 0 },
      ]} />}
    />
  );
}

export const motionScopes: ScopeDef[] = [
  {
    id: "motion.orientation", name: "Device orientation", domain: "motion",
    atlas: ["web.location.device-orientation", "web.location.sensor-orientation", "web.location.sensor-gyroscope"],
    summary: "Reads how the device is tilted and turned in space, as three angles.",
    call: "window.addEventListener('deviceorientation', e => e.alpha, e.beta, e.gamma)",
    gesture: true,
    reveals: ["How you hold the phone: in hand, on a desk, in a pocket", "Whether you are walking or sitting, from tilt wobble", "A gyroscope fingerprint unique to your hardware"],
    feeds: ["motion.accelerometer", "place.compass"],
    metrics: [{ key: "alpha", label: "alpha", unit: "deg", digits: 0 }, { key: "beta", label: "beta", unit: "deg", digits: 0 }, { key: "gamma", label: "gamma", unit: "deg", digits: 0 }],
    live: oriLive, sim: oriSim, Instrument: Orientation,
  },
  {
    id: "motion.accelerometer", name: "Accelerometer and gyro", domain: "motion",
    atlas: ["web.location.device-orientation", "web.location.sensor-accelerometer"],
    summary: "Reads acceleration and rotation speed, enough to count steps and spot a shake.",
    call: "window.addEventListener('devicemotion', e => e.acceleration, e.rotationRate)",
    gesture: true,
    reveals: ["Steps and walking pace", "Whether you are in a car, on a train or on foot", "Taps and typing on a desk the phone rests on"],
    feeds: ["motion.orientation", "place.geolocation"],
    metrics: [{ key: "mag", label: "magnitude", unit: "m/s2", digits: 1 }, { key: "peak", label: "peak", unit: "m/s2", digits: 1 }, { key: "steps", label: "steps" }],
    live: accLive, sim: accSim, Instrument: Accelerometer,
  },
  {
    id: "motion.pointer", name: "Pointer movement", domain: "motion",
    atlas: ["web.perf.mouse-dynamics", "web.input.pointer-events"],
    summary: "Watches where the pointer goes and how fast. No prompt is ever shown.",
    call: "window.addEventListener('pointermove', e => e.clientX, e.clientY)",
    passive: true,
    reveals: ["Behavioural biometrics: your movement style identifies you", "Hesitation, interest and confusion on a page", "Whether a human or a script is driving"],
    feeds: ["motion.keystroke", "motion.attention"],
    metrics: [{ key: "speed", label: "speed", unit: "px/s", digits: 0 }, { key: "dist", label: "distance", unit: "px", digits: 0 }, { key: "clicks", label: "clicks" }],
    live: ptrLive, sim: ptrSim, Instrument: Pointer,
  },
  {
    id: "motion.keystroke", name: "Keystroke timing", domain: "motion",
    atlas: ["web.perf.keystroke-dynamics"],
    summary: "Measures how long you hold each key and the gaps between keys. Never which key.",
    call: "window.addEventListener('keydown' / 'keyup', e => performance.now())",
    passive: true,
    reveals: ["A typing rhythm that can identify you across sites", "Fatigue, stress or a different person at the keyboard", "Whether input is pasted or typed by a bot"],
    feeds: ["motion.pointer", "motion.attention"],
    metrics: [{ key: "mean_dwell", label: "dwell", unit: "ms", digits: 0 }, { key: "mean_flight", label: "flight", unit: "ms", digits: 0 }, { key: "kpm", label: "keys/min", digits: 0 }],
    live: keyLive, sim: keySim, Instrument: Keystroke,
  },
  {
    id: "motion.attention", name: "Attention and idle", domain: "motion",
    atlas: ["web.perf.page-visibility-focus", "web.perf.idle-detection-user-activation"],
    summary: "Tracks when the tab is visible, in focus, hidden, or idle.",
    call: "document.addEventListener('visibilitychange'); window.addEventListener('focus' / 'blur')",
    passive: true,
    reveals: ["When you read, when you leave, and how long you were gone", "Whether you multitask in other tabs", "Your working rhythm across the day"],
    feeds: ["motion.pointer", "motion.keystroke"],
    metrics: [{ key: "visible_s", label: "visible", unit: "s", digits: 0 }, { key: "hidden_s", label: "away", unit: "s", digits: 0 }, { key: "switches", label: "switches" }],
    params: [{ key: "idle_s", label: "Idle after", type: "number", value: 10, min: 3, max: 60, step: 1, unit: "s", hint: "Seconds with no pointer, key, scroll or touch before you count as idle." }],
    live: attLive, sim: attSim, Instrument: Attention,
  },
];
