import { useState, type ComponentType, type ReactNode } from "react";
import { Archive, Binary, Boxes, Bot, Cable, Cpu, FileArchive, Film, Fingerprint, Gauge, KeyRound, Layers, Network, Power, Rocket, Send, Timer } from "lucide-react";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { unsupported } from "../core/harness";
import { Frame, Readout, Spark, Waiting } from "../ui/kit";
import { bind, errText, useCtl, type Patch } from "./page-controls";
import "./page-controls.css";
import "./page-actions-compute.css";

// Background, compute and network demos. Each scope runs a real, small, self-contained job in
// this tab (compress bytes, spawn workers, open a loopback data channel, ...), measures it and
// shows the numbers. Nothing leaves the page except the beacon demo, which posts a worthless
// probe to this site's own /api/ingest (the server rejects it and stores nothing). Stop cleans up
// every timer, worker, cache entry and injected element the scope made.

type Base = { lines: string[]; running: boolean; runs: number; fail: string; series: number[] };
const blank = (): Base => ({ lines: [], running: false, runs: 0, fail: "", series: [] });

type H<S extends Base> = { st: S; set: (u: Partial<S>) => void; log: (m: string) => void; signal: AbortSignal };

/** Both the live and the simulated adapter use this: it keeps one state object, emits it on every
 * change and runs one job per Run click. Stop aborts the signal and calls `restore`. */
function runLive<S extends Base>(id: string, ctx: Ctx, o: { init: S; auto?: boolean; run: (p: Patch, h: H<S>) => Promise<void> | void; restore?: () => void }): Stop {
  const st = { ...o.init } as S;
  const ac = new AbortController();
  let busy = false;
  const set = (u: Partial<S>) => { Object.assign(st, u); if (!ac.signal.aborted) ctx.emit({ ...st }); };
  const h: H<S> = { st, set, signal: ac.signal, log: (m) => set({ lines: [...st.lines, m].slice(-14) } as Partial<S>) };
  const go = async (p: Patch) => {
    if (busy) return;
    busy = true;
    set({ running: true, fail: "" } as Partial<S>);
    try { await o.run(p, h); set({ runs: st.runs + 1 } as Partial<S>); }
    catch (e) { if (!ac.signal.aborted) set({ fail: errText(e) } as Partial<S>); }
    finally { busy = false; if (!ac.signal.aborted) set({ running: false } as Partial<S>); }
  };
  const stop = bind(id, ctx, { read: () => ({ ...st }), apply: go, restore: () => { ac.abort(); o.restore?.(); } });
  if (o.auto) void go({ auto: true });
  return stop;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => performance.now();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const KB = 1024;
const kbs = (n: number) => (n >= 1024 * KB ? (n / KB / KB).toFixed(2) + " MB" : (n / KB).toFixed(1) + " KB");
const mbps = (bytes: number, ms: number) => (ms > 0 ? bytes / KB / KB / (ms / 1000) : 0);
const busy = (ms: number) => { const t = now(); while (now() - t < ms); };
const g = globalThis as any;

function fill(n: number, kind: string): Uint8Array {
  const out = new Uint8Array(n);
  if (kind === "random") for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  else if (kind === "text") { const s = new TextEncoder().encode("The quick brown fox jumps over the lazy dog. Platform ontology console. "); for (let i = 0; i < n; i++) out[i] = s[i % s.length]; }
  return out;
}

// ---------- Shared instrument ----------

type Row = { k: string; v: unknown; u?: string; digits?: number; hot?: boolean };
type CtlProps<T> = { d: T; on: boolean; sim: boolean; send: (p: Patch) => void; sid?: string };

function makeInstrument<T extends Base>(cfg: { wait: string; note: string; Controls: ComponentType<CtlProps<T>>; rows: (d: T) => Row[]; extra?: (d: T) => ReactNode; spark?: string }) {
  return function Instrument({ scope, session }: InstrumentProps) {
    const { d, on, sim, send } = useCtl<T>(scope, session);
    const sid = scope.id;
    if (!d) return <Frame visual={<Waiting session={session} what={cfg.wait} />} />;
    return (
      <Frame
        visual={
          <div className="pc">
            <cfg.Controls d={d} on={on} sim={sim} send={send} sid={sid} />
            {cfg.extra?.(d)}
            {d.series.length > 1 && <div className="pca-spark"><span>{cfg.spark}</span><Spark values={d.series} w={220} h={34} /></div>}
            {d.lines.length > 0 && <pre className="pca-log">{d.lines.join("\n")}</pre>}
            {d.fail && <p className="pc-msg err">{d.fail}</p>}
            <p className="pc-foot">
              {!on ? "Stopped. Run it again to use the controls." : sim ? "Simulated: these numbers are made up, your browser is untouched." : cfg.note}
            </p>
          </div>
        }
        side={<Readout rows={cfg.rows(d)} />}
      />
    );
  };
}

function Run({ on, running, onClick, label = "Run", busyLabel = "Running", "data-control": control }: { on: boolean; running: boolean; onClick: () => void; label?: string; busyLabel?: string; "data-control"?: string }) {
  return <button data-control={control} className="btn sm pri" type="button" disabled={!on || running} onClick={onClick}>{running ? busyLabel + "…" : label}</button>;
}

function Seg({ value, opts, on, set, "data-control": control }: { value: string; opts: string[]; on: boolean; set: (v: string) => void; "data-control"?: string }) {
  return <div className="seg">{opts.map((o) => <button key={o} data-control={control ? `${control}.${o}` : undefined} type="button" className={value === o ? "on" : ""} disabled={!on} onClick={() => set(o)}>{o}</button>)}</div>;
}

function Rng({ label, value, min, max, step = 1, unit, on, set, "data-control": control }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; on: boolean; set: (v: number) => void; "data-control"?: string }) {
  return (
    <label className="pc-rng">{label}
      <input data-control={control} type="range" min={min} max={max} step={step} value={value} disabled={!on} onChange={(e) => set(+e.target.value)} />
      <b>{value}{unit ? " " + unit : ""}</b>
    </label>
  );
}

const OnlyRun = ({ on, d, send, label, "data-control": control }: { on: boolean; d: Base; send: (p: Patch) => void; label: string; "data-control"?: string }) => (
  <div className="pc-row"><Run data-control={control} on={on} running={d.running} onClick={() => send({})} label={label} /></div>
);

// ---------- Compression streams ----------

type CompRec = Base & { format: string; kind: string; input: number | null; output: number | null; ratio: number | null; compMs: number | null; compMBs: number | null; decMs: number | null; decMBs: number | null; ok: boolean | null };
const compInit = (): CompRec => ({ ...blank(), format: "gzip", kind: "text", input: null, output: null, ratio: null, compMs: null, compMBs: null, decMs: null, decMBs: null, ok: null });

async function collect(rs: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let n = 0;
  const r = rs.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of parts) { out.set(c, o); o += c.length; }
  return out;
}

function compLive(ctx: Ctx) {
  if (typeof g.CompressionStream === "undefined") unsupported("CompressionStream");
  return runLive<CompRec>("reach.compression", ctx, {
    init: compInit(),
    run: async (p, h) => {
      const format = String(p.format || "gzip"), kind = String(p.kind || "text"), n = Math.round((Number(p.kb) || 1024) * KB);
      const data = fill(n, kind);
      const t0 = now();
      const packed = await collect(new Blob([data as BlobPart]).stream().pipeThrough(new g.CompressionStream(format)));
      const t1 = now();
      const back = await collect(new Blob([packed as BlobPart]).stream().pipeThrough(new g.DecompressionStream(format)));
      const t2 = now();
      let ok = back.length === data.length;
      for (let i = 0; ok && i < data.length; i += 1) if (back[i] !== data[i]) ok = false;
      h.set({ format, kind, input: n, output: packed.length, ratio: n / Math.max(1, packed.length), compMs: t1 - t0, compMBs: mbps(n, t1 - t0), decMs: t2 - t1, decMBs: mbps(n, t2 - t1), ok });
      h.log(`${format}: ${kbs(n)} of ${kind} became ${kbs(packed.length)} in ${(t1 - t0).toFixed(1)} ms, round trip ${ok ? "matches" : "DIFFERS"}`);
    },
  });
}

function compSim(ctx: Ctx) {
  return runLive<CompRec>("reach.compression", ctx, {
    init: compInit(),
    run: async (p, h) => {
      await sleep(250);
      const kind = String(p.kind || "text"), n = Math.round((Number(p.kb) || 1024) * KB);
      const out = kind === "random" ? n * 1.0004 : kind === "zeros" ? n / 1030 : n / 38;
      const cm = n / KB / KB / 85 * 1000, dm = n / KB / KB / 260 * 1000;
      h.set({ format: String(p.format || "gzip"), kind, input: n, output: Math.round(out), ratio: n / out, compMs: cm, compMBs: 85, decMs: dm, decMBs: 260, ok: true });
      h.log(`(simulated) ${kbs(n)} became ${kbs(out)}`);
    },
  });
}

function CompControls({ d, on, send }: CtlProps<CompRec>) {
  const [kb, setKb] = useState(1024);
  const [format, setFormat] = useState("gzip");
  const [kind, setKind] = useState("text");
  return (
    <>
      <div className="pc-row"><span className="pc-l">Format</span><Seg data-control="reach.compression.format" value={format} opts={["gzip", "deflate", "deflate-raw"]} on={on} set={setFormat} /></div>
      <div className="pc-row"><span className="pc-l">Data</span><Seg data-control="reach.compression.data" value={kind} opts={["text", "random", "zeros"]} on={on} set={setKind} /></div>
      <div className="pc-row"><Rng data-control="reach.compression.size" label="Size" value={kb} min={64} max={8192} step={64} unit="KB" on={on} set={setKb} /><Run data-control="reach.compression.run" on={on} running={d.running} onClick={() => send({ kb, format, kind })} label="Compress and check" /></div>
    </>
  );
}

const CompInstrument = makeInstrument<CompRec>({
  wait: "Compresses bytes with the browser's own gzip, then unpacks them and checks they match.",
  note: "Live: the browser's built in compressor ran on bytes made in this tab. Random data barely shrinks, text shrinks a lot.",
  Controls: CompControls,
  rows: (d) => [
    { k: "Format", v: d.format },
    { k: "Input", v: d.input === null ? null : kbs(d.input) },
    { k: "Compressed", v: d.output === null ? null : kbs(d.output), hot: true },
    { k: "Ratio", v: d.ratio, u: "to 1", digits: 1 },
    { k: "Compress speed", v: d.compMBs, u: "MB/s", digits: 0 },
    { k: "Compress time", v: d.compMs, u: "ms", digits: 1 },
    { k: "Unpack speed", v: d.decMBs, u: "MB/s", digits: 0 },
    { k: "Round trip matches", v: d.ok },
  ],
});

// ---------- Cross-origin isolation ----------

type IsoRec = Base & { isolated: boolean | null; secure: boolean | null; sab: boolean | null; sabAlloc: boolean | null; coop: string; coep: string; memApi: boolean | null; resUs: number | null };
const isoInit = (): IsoRec => ({ ...blank(), isolated: null, secure: null, sab: null, sabAlloc: null, coop: "", coep: "", memApi: null, resUs: null });

function timerResolutionUs(): number {
  let best = Infinity;
  for (let i = 0; i < 40000; i++) { const a = now(); let b = now(); while (b === a) b = now(); best = Math.min(best, b - a); }
  return best * 1000;
}

function isoLive(ctx: Ctx) {
  return runLive<IsoRec>("reach.isolation", ctx, {
    init: isoInit(), auto: true,
    run: async (_p, h) => {
      let sabAlloc = false;
      try { sabAlloc = typeof g.SharedArrayBuffer === "function" && new g.SharedArrayBuffer(8).byteLength === 8; } catch { /* blocked */ }
      let coop = "", coep = "";
      try {
        const r = await fetch(location.href, { method: "HEAD", cache: "no-store" });
        coop = r.headers.get("cross-origin-opener-policy") || "not sent";
        coep = r.headers.get("cross-origin-embedder-policy") || "not sent";
      } catch { coop = coep = "unreadable"; }
      h.set({ isolated: !!g.crossOriginIsolated, secure: !!g.isSecureContext, sab: typeof g.SharedArrayBuffer === "function", sabAlloc, coop, coep, memApi: typeof (performance as any).measureUserAgentSpecificMemory === "function", resUs: timerResolutionUs() });
      h.log(g.crossOriginIsolated ? "This page is isolated: shared memory and sharper timers are on." : "This page is not isolated: shared memory and fine timers are held back.");
    },
  });
}

function isoSim(ctx: Ctx) {
  return runLive<IsoRec>("reach.isolation", ctx, {
    init: isoInit(), auto: true,
    run: async (_p, h) => { await sleep(150); h.set({ isolated: false, secure: true, sab: false, sabAlloc: false, coop: "not sent", coep: "not sent", memApi: false, resUs: 100 }); h.log("(simulated) not isolated: timers rounded to 100 microseconds"); },
  });
}

const IsoInstrument = makeInstrument<IsoRec>({
  wait: "Checks whether this page is cross origin isolated and what that unlocks.",
  note: "Live: read from this tab and this page's own response headers. Isolation needs two headers (COOP and COEP) from the server.",
  Controls: ({ d, on, send }) => <OnlyRun data-control="reach.isolation.measure-again" on={on} d={d} send={send} label="Measure again" />,
  rows: (d) => [
    { k: "Cross origin isolated", v: d.isolated, hot: true },
    { k: "Secure context", v: d.secure },
    { k: "SharedArrayBuffer exists", v: d.sab },
    { k: "Can allocate one", v: d.sabAlloc },
    { k: "COOP header", v: d.coop || null },
    { k: "COEP header", v: d.coep || null },
    { k: "Memory measuring API", v: d.memApi },
    { k: "Smallest timer step", v: d.resUs, u: "µs", digits: 1, hot: true },
  ],
});

// ---------- Background timer throttling ----------

type ThrRec = Base & { active: boolean; visible: boolean; ticks: number; visAvg: number | null; hidAvg: number | null; hidMax: number | null; hidTicks: number; last: number | null; simHide: boolean };
const thrInit = (): ThrRec => ({ ...blank(), active: false, visible: true, ticks: 0, visAvg: null, hidAvg: null, hidMax: null, hidTicks: 0, last: null, simHide: false });
const EXPECT = 250;

function throttleCore(id: string, ctx: Ctx, fake: boolean) {
  let timer = 0, last = 0;
  let vis: number[] = [], hid: number[] = [];
  let detach: (() => void) | null = null;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return runLive<ThrRec>(id, ctx, {
    init: thrInit(), auto: true,
    run: (p, h) => {
      if (p.reset) { vis = []; hid = []; h.set({ ticks: 0, visAvg: null, hidAvg: null, hidMax: null, hidTicks: 0, last: null, series: [], lines: [] }); return; }
      if (p.simHide !== undefined) { h.set({ simHide: !!p.simHide }); return; }
      if (timer) { clearTimeout(timer); timer = 0; detach?.(); detach = null; h.set({ active: false }); return; }
      last = now();
      const onVis = () => h.set({ visible: !document.hidden });
      document.addEventListener("visibilitychange", onVis);
      detach = () => document.removeEventListener("visibilitychange", onVis);
      const loop = () => {
        timer = window.setTimeout(() => {
          const t = now();
          const hidden = fake ? h.st.simHide : document.hidden;
          const dt = fake ? (hidden ? rnd(999, 1002) : rnd(249, 256)) : t - last;
          last = t;
          (hidden ? hid : vis).push(dt);
          h.set({ active: true, visible: !hidden, ticks: vis.length + hid.length, visAvg: avg(vis), hidAvg: avg(hid), hidMax: hid.length ? Math.max(...hid) : null, hidTicks: hid.length, last: dt, series: [...h.st.series, dt].slice(-80) });
          loop();
        }, EXPECT);
      };
      h.set({ active: true, visible: fake ? !h.st.simHide : !document.hidden });
      loop();
    },
    restore: () => { clearTimeout(timer); timer = 0; detach?.(); },
  });
}

const ThrControls = ({ d, on, sim, send }: CtlProps<ThrRec>) => (
  <>
    <div className="pc-row">
      <button data-control="reach.timer-throttle.toggle" className="btn sm pri" type="button" disabled={!on} onClick={() => send({})}>{d.active ? "Pause the timer" : "Start the timer"}</button>
      <button data-control="reach.timer-throttle.clear" className="btn sm" type="button" disabled={!on} onClick={() => send({ reset: true })}>Clear numbers</button>
      {sim && <label className="pc-sw"><input data-control="reach.timer-throttle.simulate-hidden" type="checkbox" checked={d.simHide} disabled={!on} onChange={(e) => send({ simHide: e.target.checked })} />Pretend the tab is hidden</label>}
    </div>
    <p className="pc-msg">A timer asks to fire every {EXPECT} ms. {sim ? "Tick the box to see a hidden tab." : "Switch to another tab for about 10 seconds, then come back and read the hidden numbers."}</p>
  </>
);

const ThrInstrument = makeInstrument<ThrRec>({
  wait: "Runs a 250 ms timer and measures how far the browser stretches it once the tab is hidden.",
  note: "Live: a real timer in this tab. Chrome slows hidden tabs to about one tick a second, and much slower after five minutes.",
  Controls: ThrControls,
  spark: "Gap between ticks, ms",
  rows: (d) => [
    { k: "Tab now", v: d.visible ? "visible" : "hidden" },
    { k: "Ticks counted", v: d.ticks, digits: 0 },
    { k: "Gap when visible", v: d.visAvg, u: "ms", digits: 1 },
    { k: "Gap when hidden", v: d.hidAvg, u: "ms", digits: 0, hot: true },
    { k: "Slowest hidden gap", v: d.hidMax, u: "ms", digits: 0 },
    { k: "Slowdown", v: d.visAvg && d.hidAvg ? d.hidAvg / d.visAvg : null, u: "x", digits: 1, hot: true },
    { k: "Last gap", v: d.last, u: "ms", digits: 0 },
  ],
});

// ---------- Scheduler ----------

type SchRec = Base & { postTask: boolean; yieldFn: boolean; inputPending: boolean; order: string; spreadMs: number | null; aborted: string; blockedNoYield: number | null; blockedYield: number | null; workMs: number };
const schInit = (): SchRec => ({ ...blank(), postTask: false, yieldFn: false, inputPending: false, order: "", spreadMs: null, aborted: "", blockedNoYield: null, blockedYield: null, workMs: 200 });

function schLive(ctx: Ctx) {
  const sc = g.scheduler;
  if (!sc || typeof sc.postTask !== "function") unsupported("scheduler.postTask");
  return runLive<SchRec>("reach.scheduler", ctx, {
    init: { ...schInit(), postTask: true, yieldFn: typeof sc.yield === "function", inputPending: typeof sc.isInputPending === "function" }, auto: true,
    run: async (p, h) => {
      // 1. Priority order: post the lowest priority first, the highest last.
      const done: string[] = [], t0 = now();
      let lastAt = 0;
      const order = ["background", "user-visible", "user-blocking"];
      await Promise.all([
        ...order.map((pr) => sc.postTask(() => { done.push(pr); lastAt = now() - t0; }, { priority: pr })),
        new Promise<void>((r) => setTimeout(() => { done.push("setTimeout"); r(); }, 0)),
      ]);
      // 2. Abort a queued task.
      const ctl = new g.TaskController();
      const q = sc.postTask(() => "ran", { signal: ctl.signal, priority: "background" });
      ctl.abort();
      let aborted = "";
      try { await q; aborted = "task still ran"; } catch (e: any) { aborted = e?.name || "aborted"; }
      h.set({ order: done.join(" > "), spreadMs: lastAt, aborted });
      h.log(`Posted lowest first, ran in this order: ${done.join(" > ")}`);
      h.log(`Aborting a queued task: ${aborted}`);
      if (p.auto) return;
      // 3. Yielding keeps the page responsive during long work.
      const workMs = Number(p.workMs) || 200;
      const pause = () => (typeof sc.yield === "function" ? sc.yield() : new Promise<void>((r) => setTimeout(r)));
      const probe = async (yielding: boolean) => {
        const start = now();
        let fired = 0;
        setTimeout(() => { fired = now() - start; }, 0);
        for (let i = 0; i < workMs / 5; i++) { busy(5); if (yielding) await pause(); }
        while (!fired) await new Promise<void>((r) => setTimeout(r));
        return fired;
      };
      const a = await probe(false);
      const b = await probe(true);
      h.set({ blockedNoYield: a, blockedYield: b, workMs });
      h.log(`${workMs} ms of work. A waiting task started after ${a.toFixed(0)} ms without yielding, ${b.toFixed(0)} ms with ${typeof sc.yield === "function" ? "scheduler.yield()" : "a timer yield"}.`);
    },
  });
}

function schSim(ctx: Ctx) {
  return runLive<SchRec>("reach.scheduler", ctx, {
    init: { ...schInit(), postTask: true, yieldFn: true, inputPending: true }, auto: true,
    run: async (p, h) => {
      await sleep(200);
      h.set({ order: "user-blocking > user-visible > setTimeout > background", spreadMs: 3.4, aborted: "AbortError" });
      if (p.auto) return;
      const w = Number(p.workMs) || 200;
      await sleep(300);
      h.set({ blockedNoYield: w + 1, blockedYield: 5.6, workMs: w });
      h.log(`(simulated) ${w} ms of work blocked a waiting task for ${w + 1} ms, with yielding 5.6 ms`);
    },
  });
}

function SchControls({ d, on, send }: CtlProps<SchRec>) {
  const [w, setW] = useState(200);
  return (
    <div className="pc-row">
      <Rng data-control="reach.scheduler.work" label="Work" value={w} min={100} max={600} step={50} unit="ms" on={on} set={setW} />
      <Run data-control="reach.scheduler.run" on={on} running={d.running} onClick={() => send({ workMs: w })} label="Run all three tests" />
    </div>
  );
}

const SchInstrument = makeInstrument<SchRec>({
  wait: "Posts tasks at three priorities, aborts one, then shows how yielding keeps the page responsive.",
  note: "Live: tasks ran in this tab. The yield test blocks the page for the Work time on purpose, so it freezes briefly.",
  Controls: SchControls,
  rows: (d) => [
    { k: "postTask", v: d.postTask },
    { k: "scheduler.yield", v: d.yieldFn },
    { k: "isInputPending", v: d.inputPending },
    { k: "Run order", v: d.order || null, hot: true },
    { k: "Abort result", v: d.aborted || null },
    { k: "Waiting task delay, no yield", v: d.blockedNoYield, u: "ms", digits: 0, hot: true },
    { k: "Waiting task delay, yielding", v: d.blockedYield, u: "ms", digits: 0, hot: true },
  ],
});

// ---------- Beacon ----------

type BeaRec = Base & { queued: boolean | null; bytes: number | null; queueMs: number | null; status: number | null; answer: string; rtt: number | null; sent: number; leave: boolean; leaveSent: number; apiOk: boolean };
const beaInit = (): BeaRec => ({ ...blank(), queued: null, bytes: null, queueMs: null, status: null, answer: "", rtt: null, sent: 0, leave: false, leaveSent: 0, apiOk: true });
const BEACON_URL = "/api/ingest";

function beaLive(ctx: Ctx) {
  if (typeof navigator.sendBeacon !== "function") unsupported("navigator.sendBeacon");
  let onLeave: (() => void) | null = null;
  return runLive<BeaRec>("reach.beacon", ctx, {
    init: beaInit(),
    run: async (p, h) => {
      if (p.leave !== undefined) {
        if (p.leave && !onLeave) {
          onLeave = () => { if (document.hidden && navigator.sendBeacon(BEACON_URL, new Blob(['{"probe":"leave"}'], { type: "text/plain" }))) h.set({ leaveSent: h.st.leaveSent + 1 }); };
          document.addEventListener("visibilitychange", onLeave);
        } else if (!p.leave && onLeave) { document.removeEventListener("visibilitychange", onLeave); onLeave = null; }
        h.set({ leave: !!p.leave });
        return;
      }
      const kb = Math.max(1, Math.min(60, Number(p.kb) || 4));
      const body = JSON.stringify({ probe: "po-console-beacon-demo", pad: "x".repeat(kb * KB) });
      const blob = new Blob([body], { type: "text/plain" });
      const t0 = now();
      const queued = navigator.sendBeacon(BEACON_URL, blob);
      const queueMs = now() - t0;
      h.set({ queued, bytes: blob.size, queueMs, sent: h.st.sent + 1 });
      // A beacon cannot read its answer; the same request through fetch with keepalive can.
      const t1 = now();
      try {
        const r = await fetch(BEACON_URL, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } });
        let msg = "";
        try { msg = String((await r.json()).error || "ok"); } catch { msg = r.statusText || "no body"; }
        h.set({ status: r.status, answer: msg, rtt: now() - t1 });
        h.log(`Beacon ${queued ? "queued" : "refused"} (${kbs(blob.size)}). Same body by keepalive fetch: ${r.status} ${msg}`);
      } catch (e) {
        h.set({ status: null, answer: errText(e), rtt: null });
        h.log(`Beacon ${queued ? "queued" : "refused"}. keepalive fetch failed: ${errText(e)}`);
      }
    },
    restore: () => { if (onLeave) document.removeEventListener("visibilitychange", onLeave); onLeave = null; },
  });
}

function beaSim(ctx: Ctx) {
  return runLive<BeaRec>("reach.beacon", ctx, {
    init: beaInit(),
    run: async (p, h) => {
      if (p.leave !== undefined) { h.set({ leave: !!p.leave }); return; }
      await sleep(200);
      const kb = Math.max(1, Math.min(60, Number(p.kb) || 4));
      h.set({ queued: true, bytes: kb * KB + 60, queueMs: 0.2, status: 400, answer: "bad batch", rtt: rnd(30, 90), sent: h.st.sent + 1 });
      h.log("(simulated) beacon queued, the site's own server answered 400 bad batch");
    },
  });
}

function BeaControls({ d, on, send }: CtlProps<BeaRec>) {
  const [kb, setKb] = useState(4);
  return (
    <>
      <div className="pc-row"><Rng data-control="reach.beacon.payload" label="Payload" value={kb} min={1} max={60} unit="KB" on={on} set={setKb} /><Run data-control="reach.beacon.send" on={on} running={d.running} onClick={() => send({ kb })} label="Send a beacon" busyLabel="Sending" /></div>
      <div className="pc-row"><label className="pc-sw"><input data-control="reach.beacon.on-hide" type="checkbox" checked={d.leave} disabled={!on} onChange={(e) => send({ leave: e.target.checked })} />Also send a tiny beacon each time this tab is hidden</label></div>
      <p className="pc-msg">The probe goes to this site's own /api/ingest, which rejects it as a malformed batch and stores nothing. The point is that the browser sends it even if the tab closes.</p>
    </>
  );
}

const BeaInstrument = makeInstrument<BeaRec>({
  wait: "Hands the browser a small request that is delivered even after this tab closes.",
  note: "Live: a real POST to this site only. Switch tabs with the checkbox on and the leave counter goes up.",
  Controls: BeaControls,
  rows: (d) => [
    { k: "Browser accepted it", v: d.queued, hot: true },
    { k: "Size", v: d.bytes === null ? null : kbs(d.bytes) },
    { k: "Time to queue", v: d.queueMs, u: "ms", digits: 2 },
    { k: "Server answer", v: d.status === null ? d.answer || null : `${d.status} ${d.answer}` },
    { k: "Round trip (fetch)", v: d.rtt, u: "ms", digits: 0 },
    { k: "Beacons sent", v: d.sent, digits: 0 },
    { k: "Sent on tab hide", v: d.leaveSent, digits: 0 },
  ],
});

// ---------- Cache API ----------

type CacheRec = Base & { entries: { url: string; bytes: number }[]; caches: { name: string; count: number }[]; sw: boolean; swRegs: number | null; writeMs: number | null; readMs: number | null; total: number };
const cacheInit = (): CacheRec => ({ ...blank(), entries: [], caches: [], sw: false, swRegs: null, writeMs: null, readMs: null, total: 0 });
const CACHE_NAME = "po-console-demo";

async function snapshot(): Promise<Pick<CacheRec, "entries" | "caches" | "swRegs" | "total">> {
  const c = await caches.open(CACHE_NAME);
  const keys = await c.keys();
  const entries: CacheRec["entries"] = [];
  for (const k of keys) { const r = await c.match(k); entries.push({ url: new URL(k.url).pathname, bytes: r ? (await r.blob()).size : 0 }); }
  const names = await caches.keys();
  const list: CacheRec["caches"] = [];
  for (const n of names) list.push({ name: n, count: (await (await caches.open(n)).keys()).length });
  let swRegs: number | null = null;
  try { swRegs = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : null; } catch { /* blocked */ }
  return { entries, caches: list, swRegs, total: entries.reduce((a, e) => a + e.bytes, 0) };
}

function cacheLive(ctx: Ctx) {
  if (!("caches" in g)) unsupported("Cache API");
  return runLive<CacheRec>("reach.cache", ctx, {
    init: { ...cacheInit(), sw: "serviceWorker" in navigator }, auto: true,
    run: async (p, h) => {
      const op = String(p.op || "read");
      const c = await caches.open(CACHE_NAME);
      if (op === "write") {
        const kb = Number(p.kb) || 64, n = (await c.keys()).length + 1;
        const t0 = now();
        await c.put(new Request(`${location.origin}/__po-demo/${Date.now()}-${n}`), new Response(new Blob([fill(kb * KB, "text") as BlobPart]), { headers: { "content-type": "text/plain" } }));
        h.set({ writeMs: now() - t0 });
        h.log(`Stored ${kb} KB as entry ${n} in the cache "${CACHE_NAME}"`);
      } else if (op === "clear") {
        await caches.delete(CACHE_NAME);
        h.log("Deleted the demo cache");
      }
      const t1 = now();
      const s = await snapshot();
      h.set({ ...s, readMs: now() - t1 });
      if (op === "read") h.log(`Read back ${s.entries.length} entries (${kbs(s.total)}) from the demo cache`);
    },
    restore: () => { void caches.delete(CACHE_NAME); },
  });
}

function cacheSim(ctx: Ctx) {
  const fake: CacheRec["entries"] = [];
  return runLive<CacheRec>("reach.cache", ctx, {
    init: { ...cacheInit(), sw: true, swRegs: 0 }, auto: true,
    run: async (p, h) => {
      await sleep(120);
      const op = String(p.op || "read");
      if (op === "write") fake.push({ url: `/__po-demo/${fake.length + 1}`, bytes: (Number(p.kb) || 64) * KB });
      if (op === "clear") fake.length = 0;
      h.set({ entries: [...fake], caches: [{ name: CACHE_NAME, count: fake.length }, { name: "workbox-precache", count: 14 }], total: fake.reduce((a, e) => a + e.bytes, 0), writeMs: op === "write" ? rnd(2, 9) : h.st.writeMs, readMs: rnd(1, 4) });
      h.log(`(simulated) ${op}: ${fake.length} entries`);
    },
  });
}

function CacheControls({ d, on, send }: CtlProps<CacheRec>) {
  const [kb, setKb] = useState(64);
  return (
    <div className="pc-row">
      <Rng data-control="reach.cache.entry" label="Entry" value={kb} min={1} max={1024} unit="KB" on={on} set={setKb} />
      <Run data-control="reach.cache.store" on={on} running={d.running} onClick={() => send({ op: "write", kb })} label="Store an entry" busyLabel="Working" />
      <button data-control="reach.cache.read" className="btn sm" type="button" disabled={!on || d.running} onClick={() => send({ op: "read" })}>Read back</button>
      <button data-control="reach.cache.clear" className="btn sm" type="button" disabled={!on || d.running} onClick={() => send({ op: "clear" })}>Clear</button>
    </div>
  );
}

const CacheInstrument = makeInstrument<CacheRec>({
  wait: "Stores and reads whole responses in the browser's cache, the storage a service worker uses to work offline.",
  note: "Live: entries go in one cache named po-console-demo, listed below, and Stop deletes it. No service worker is installed by this demo.",
  Controls: CacheControls,
  extra: (d) => d.entries.length > 0 ? <div className="pc-list">{d.entries.map((e) => <div className="pc-li" key={e.url}><code>{kbs(e.bytes)}</code><span>{e.url}</span></div>)}</div> : null,
  rows: (d) => [
    { k: "Demo entries", v: d.entries.length, digits: 0, hot: true },
    { k: "Demo bytes", v: kbs(d.total) },
    { k: "Write time", v: d.writeMs, u: "ms", digits: 1 },
    { k: "Read time", v: d.readMs, u: "ms", digits: 1 },
    { k: "Caches on this site", v: d.caches.length ? d.caches.map((c) => `${c.name} (${c.count})`).join(", ") : null },
    { k: "Service worker API", v: d.sw },
    { k: "Workers registered", v: d.swRegs, digits: 0 },
  ],
});

// ---------- Speculation rules ----------

type SpecRec = Base & { supported: boolean; injected: boolean; rule: string; target: string; eagerness: string; seen: number };
const specInit = (): SpecRec => ({ ...blank(), supported: false, injected: false, rule: "", target: "/?po-prefetch=1", eagerness: "moderate", seen: 0 });
const SPEC_ID = "po-speculation-demo";

function specLive(ctx: Ctx) {
  if (!(g.HTMLScriptElement as any)?.supports?.("speculationrules")) unsupported("Speculation rules");
  let po: PerformanceObserver | null = null;
  const remove = () => { document.getElementById(SPEC_ID)?.remove(); po?.disconnect(); po = null; };
  return runLive<SpecRec>("reach.prefetch", ctx, {
    init: { ...specInit(), supported: true },
    run: (p, h) => {
      remove();
      if (p.remove) { h.set({ injected: false, rule: "", seen: 0 }); h.log("Removed the rule"); return; }
      const target = String(p.target || "/?po-prefetch=1"), eagerness = String(p.eagerness || "moderate");
      const rules = { prefetch: [{ source: "list", urls: [target], eagerness }] };
      const rule = JSON.stringify(rules, null, 2);
      const s = document.createElement("script");
      s.type = "speculationrules"; s.id = SPEC_ID; s.textContent = JSON.stringify(rules);
      document.head.appendChild(s);
      const abs = new URL(target, location.href).href;
      let seen = 0;
      try {
        po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === abs) { seen++; h.set({ seen }); } });
        po.observe({ type: "resource", buffered: false });
      } catch { /* not observable */ }
      h.set({ injected: true, rule, target, eagerness, seen: 0 });
      h.log(`Injected a prefetch rule for ${target} (${eagerness}). ${eagerness === "conservative" ? "Press and hold the link below to trigger it." : "The browser may fetch it now or when you hover."}`);
    },
    restore: remove,
  });
}

function specSim(ctx: Ctx) {
  return runLive<SpecRec>("reach.prefetch", ctx, {
    init: { ...specInit(), supported: true },
    run: async (p, h) => {
      await sleep(150);
      if (p.remove) { h.set({ injected: false, rule: "", seen: 0 }); return; }
      const target = String(p.target || "/?po-prefetch=1"), eagerness = String(p.eagerness || "moderate");
      h.set({ injected: true, target, eagerness, rule: JSON.stringify({ prefetch: [{ source: "list", urls: [target], eagerness }] }, null, 2), seen: 1 });
      h.log("(simulated) rule injected, page fetched in the background");
    },
  });
}

function SpecControls({ d, on, send }: CtlProps<SpecRec>) {
  const [target, setTarget] = useState("/?po-prefetch=1");
  const [eag, setEag] = useState("moderate");
  return (
    <>
      <div className="pc-row"><span className="pc-l">Page</span><Seg data-control="reach.prefetch.page" value={target} opts={["/", "/?po-prefetch=1"]} on={on} set={setTarget} /></div>
      <div className="pc-row"><span className="pc-l">When</span><Seg data-control="reach.prefetch.when" value={eag} opts={["conservative", "moderate", "eager", "immediate"]} on={on} set={setEag} /></div>
      <div className="pc-row">
        <Run data-control="reach.prefetch.add-rule" on={on} running={d.running} onClick={() => send({ target, eagerness: eag })} label="Add the rule" busyLabel="Adding" />
        <button data-control="reach.prefetch.remove" className="btn sm" type="button" disabled={!on || !d.injected} onClick={() => send({ remove: true })}>Remove it</button>
        {d.injected && <a data-control="reach.prefetch.test-link" className="pca-link" href={d.target} onClick={(e) => e.preventDefault()}>Test link to {d.target}</a>}
      </div>
    </>
  );
}

const SpecInstrument = makeInstrument<SpecRec>({
  wait: "Adds a prefetch rule for a page on this site so the browser can load it before you click.",
  note: "Live: a real rule was added to this page's head and Stop removes it. Prefetch only, so no code of the target page runs.",
  Controls: SpecControls,
  extra: (d) => d.rule ? <pre className="pca-log">{d.rule}</pre> : null,
  rows: (d) => [
    { k: "Browser supports it", v: d.supported },
    { k: "Rule in the page", v: d.injected, hot: true },
    { k: "Target", v: d.injected ? d.target : null },
    { k: "Eagerness", v: d.injected ? d.eagerness : null },
    { k: "Seen in resource timing", v: d.seen, digits: 0 },
  ],
});

// ---------- Web Crypto ----------

type CryRec = Base & { kb: number | null; digestMs: number | null; digestMBs: number | null; digest: string; keyMs: number | null; signMs: number | null; verifyMs: number | null; verified: boolean | null; aesMs: number | null; aesMBs: number | null; aesOk: boolean | null };
const cryInit = (): CryRec => ({ ...blank(), kb: null, digestMs: null, digestMBs: null, digest: "", keyMs: null, signMs: null, verifyMs: null, verified: null, aesMs: null, aesMBs: null, aesOk: null });
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

function cryLive(ctx: Ctx) {
  if (!g.crypto?.subtle) unsupported("Web Crypto (needs a secure page)");
  const s = crypto.subtle;
  return runLive<CryRec>("reach.crypto", ctx, {
    init: cryInit(),
    run: async (p, h) => {
      const kb = Number(p.kb) || 1024, data = fill(kb * KB, "random");
      let t = now();
      const dg = await s.digest("SHA-256", data as BufferSource);
      const digestMs = now() - t;
      t = now();
      const kp = await s.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
      const keyMs = now() - t;
      t = now();
      const sig = await s.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, data as BufferSource);
      const signMs = now() - t;
      t = now();
      const verified = await s.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, sig, data as BufferSource);
      const verifyMs = now() - t;
      const key = await s.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      t = now();
      const ct = await s.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
      const pt = await s.decrypt({ name: "AES-GCM", iv }, key, ct);
      const aesMs = now() - t;
      h.set({ kb, digestMs, digestMBs: mbps(data.length, digestMs), digest: hex(dg).slice(0, 16), keyMs, signMs, verifyMs, verified, aesMs, aesMBs: mbps(data.length * 2, aesMs), aesOk: pt.byteLength === data.length });
      h.log(`SHA-256 of ${kbs(data.length)} in ${digestMs.toFixed(1)} ms. New P-256 key in ${keyMs.toFixed(1)} ms, signature ${sig.byteLength} bytes, verified ${verified}. Keys never leave the browser.`);
    },
  });
}

function crySim(ctx: Ctx) {
  return runLive<CryRec>("reach.crypto", ctx, {
    init: cryInit(),
    run: async (p, h) => {
      await sleep(250);
      const kb = Number(p.kb) || 1024;
      h.set({ kb, digestMs: kb / 1024 / 1.2, digestMBs: 1200, digest: "e3b0c44298fc1c14", keyMs: 1.8, signMs: 0.9 + kb / 4000, verifyMs: 1.4, verified: true, aesMs: kb / 1024 / 0.9, aesMBs: 900, aesOk: true });
      h.log("(simulated) hash, sign and encrypt finished");
    },
  });
}

function CryControls({ d, on, send }: CtlProps<CryRec>) {
  const [kb, setKb] = useState(1024);
  return <div className="pc-row"><Rng data-control="reach.crypto.data" label="Data" value={kb} min={16} max={16384} step={16} unit="KB" on={on} set={setKb} /><Run data-control="reach.crypto.run" on={on} running={d.running} onClick={() => send({ kb })} label="Hash, sign and encrypt" /></div>;
}

const CryInstrument = makeInstrument<CryRec>({
  wait: "Hashes random bytes, makes a signing key, signs and verifies, then encrypts and decrypts, timing each step.",
  note: "Live: the browser's own crypto engine. The private keys are non-extractable and are discarded after the run.",
  Controls: CryControls,
  rows: (d) => [
    { k: "SHA-256 speed", v: d.digestMBs, u: "MB/s", digits: 0, hot: true },
    { k: "SHA-256 start of hash", v: d.digest || null },
    { k: "New signing key", v: d.keyMs, u: "ms", digits: 1 },
    { k: "Sign", v: d.signMs, u: "ms", digits: 1 },
    { k: "Verify", v: d.verifyMs, u: "ms", digits: 1 },
    { k: "Signature valid", v: d.verified },
    { k: "AES-GCM speed", v: d.aesMBs, u: "MB/s", digits: 0, hot: true },
    { k: "Decrypts back", v: d.aesOk },
  ],
});

// ---------- Web Workers ----------

type WorkRec = Base & { cores: number; workers: number | null; baselineMs: number | null; wallMs: number | null; speedup: number | null; efficiency: number | null; stallMs: number | null; per: number[] };
const workInit = (): WorkRec => ({ ...blank(), cores: navigator.hardwareConcurrency || 0, workers: null, baselineMs: null, wallMs: null, speedup: null, efficiency: null, stallMs: null, per: [] });
const WORKER_SRC = "postMessage('ready');onmessage=e=>{const t=performance.now();let c=0;for(let n=2;n<e.data;n++){let p=true;for(let i=2;i*i<=n;i++)if(n%i===0){p=false;break}if(p)c++}postMessage({c,ms:performance.now()-t})}";
const WORK = { light: 600000, medium: 1500000, heavy: 3000000 } as const;

function workLive(ctx: Ctx) {
  if (typeof Worker === "undefined") unsupported("Web Workers");
  let pool: Worker[] = [];
  let url = "";
  const kill = () => { pool.forEach((w) => w.terminate()); pool = []; if (url) URL.revokeObjectURL(url); url = ""; };
  return runLive<WorkRec>("reach.workers", ctx, {
    init: workInit(),
    run: async (p, h) => {
      kill();
      const n = Math.max(1, Math.min(8, Number(p.n) || 2)), size = WORK[(p.size as keyof typeof WORK) || "medium"] || WORK.medium;
      url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      const spawn = async (k: number) => {
        const ws = Array.from({ length: k }, () => new Worker(url));
        pool = ws;
        await Promise.all(ws.map((w) => new Promise<void>((res, rej) => { w.onmessage = () => res(); w.onerror = (e) => rej(new Error(e.message || "worker failed to start")); })));
        return ws;
      };
      const exec = (ws: Worker[]) => Promise.all(ws.map((w) => new Promise<{ c: number; ms: number }>((res, rej) => { w.onmessage = (e) => res(e.data); w.onerror = (e) => rej(new Error(e.message)); w.postMessage(size); })));
      // Watch how long the page itself stalls while workers run: it should stay near zero.
      let stall = 0, lastTick = now(), ticking = true;
      const tick = () => { if (!ticking) return; const t = now(); stall = Math.max(stall, t - lastTick - 8); lastTick = t; setTimeout(tick, 8); };
      tick();
      try {
        h.log("Starting one worker for a baseline…");
        let t = now();
        const one = await exec(await spawn(1));
        const baseline = now() - t;
        kill(); url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
        h.set({ baselineMs: baseline });
        h.log(`1 worker counted ${one[0].c.toLocaleString()} primes in ${one[0].ms.toFixed(0)} ms. Now ${n} at once…`);
        const ws = await spawn(n);
        lastTick = now(); t = now();
        const res = await exec(ws);
        const wall = now() - t;
        const speedup = (n * baseline) / wall;
        h.set({ workers: n, wallMs: wall, speedup, efficiency: speedup / n, per: res.map((r) => r.ms), stallMs: stall });
        h.log(`${n} workers did ${n}x the work in ${wall.toFixed(0)} ms: ${speedup.toFixed(2)}x the throughput of one. Page stalled at most ${stall.toFixed(0)} ms.`);
      } finally { ticking = false; kill(); }
    },
    restore: kill,
  });
}

function workSim(ctx: Ctx) {
  return runLive<WorkRec>("reach.workers", ctx, {
    init: { ...workInit(), cores: navigator.hardwareConcurrency || 8 },
    run: async (p, h) => {
      await sleep(500);
      const n = Math.max(1, Math.min(8, Number(p.n) || 2)), base = 180;
      const wall = base * (1 + 0.08 * (n - 1));
      h.set({ workers: n, baselineMs: base, wallMs: wall, speedup: (n * base) / wall, efficiency: base / wall, stallMs: 4, per: Array.from({ length: n }, () => rnd(base, wall)) });
      h.log(`(simulated) ${n} workers, page stalled 4 ms`);
    },
  });
}

function WorkControls({ d, on, send }: CtlProps<WorkRec>) {
  const [n, setN] = useState(Math.min(4, Math.max(2, d.cores || 4)));
  const [size, setSize] = useState("medium");
  return (
    <>
      <div className="pc-row"><span className="pc-l">Work</span><Seg data-control="reach.workers.work" value={size} opts={["light", "medium", "heavy"]} on={on} set={setSize} /></div>
      <div className="pc-row"><Rng data-control="reach.workers.workers" label="Workers" value={n} min={1} max={8} on={on} set={setN} /><Run data-control="reach.workers.run" on={on} running={d.running} onClick={() => send({ n, size })} label="Run in parallel" /></div>
    </>
  );
}

const WorkInstrument = makeInstrument<WorkRec>({
  wait: "Counts primes on background threads, one worker and then several, and shows the speed up and whether the page froze.",
  note: "Live: real worker threads built from an in page script, ended when the run finishes or you stop it.",
  Controls: WorkControls,
  rows: (d) => [
    { k: "CPU cores reported", v: d.cores, digits: 0 },
    { k: "Workers used", v: d.workers, digits: 0 },
    { k: "One worker took", v: d.baselineMs, u: "ms", digits: 0 },
    { k: "All together took", v: d.wallMs, u: "ms", digits: 0 },
    { k: "Throughput vs one", v: d.speedup, u: "x", digits: 2, hot: true },
    { k: "Efficiency", v: d.efficiency === null ? null : Math.round(d.efficiency * 100), u: "%", digits: 0 },
    { k: "Worst page stall", v: d.stallMs, u: "ms", digits: 0, hot: true },
  ],
});

// ---------- WebAssembly ----------

// add(a, b) and sum(n) = 0 + 1 + ... + (n - 1) wrapped to 32 bits, hand assembled and checked.
const WASM = Uint8Array.from("0061736d01000000010c02 60027f7f017f 60017f017f 030302 0001 070d02 03616464 0000 0373756d 0001 0a2d02 07 00200020016a0b 23 01027f 0240 0340 20022000 4f0d01 2001 20026a 2101 20024101 6a2102 0c00 0b0b 2001 0b".replace(/\s+/g, "").match(/../g)!.map((x) => parseInt(x, 16)));

type WasmRec = Base & { bytes: number; compileMs: number | null; instMs: number | null; add: number | null; n: number | null; wasmMs: number | null; jsMs: number | null; match: boolean | null; exports: string };
const wasmInit = (): WasmRec => ({ ...blank(), bytes: WASM.length, compileMs: null, instMs: null, add: null, n: null, wasmMs: null, jsMs: null, match: null, exports: "" });

function wasmLive(ctx: Ctx) {
  if (typeof WebAssembly === "undefined") unsupported("WebAssembly");
  return runLive<WasmRec>("reach.wasm", ctx, {
    init: wasmInit(),
    run: async (p, h) => {
      const n = Number(p.n) || 100_000_000;
      let t = now();
      const mod = await WebAssembly.compile(WASM as BufferSource);
      const compileMs = now() - t;
      t = now();
      const inst = await WebAssembly.instantiate(mod);
      const instMs = now() - t;
      const ex = inst.exports as any;
      t = now(); const w = ex.sum(n); const wasmMs = now() - t;
      t = now(); let a = 0; for (let i = 0; i < n; i++) a = (a + i) | 0; const jsMs = now() - t;
      h.set({ compileMs, instMs, add: ex.add(2, 3), n, wasmMs, jsMs, match: (w | 0) === (a | 0), exports: WebAssembly.Module.exports(mod).map((e) => e.name).join(", ") });
      h.log(`${WASM.length} byte module compiled in ${compileMs.toFixed(2)} ms. Summing ${n.toLocaleString()} numbers: WebAssembly ${wasmMs.toFixed(0)} ms, JavaScript ${jsMs.toFixed(0)} ms.`);
    },
  });
}

function wasmSim(ctx: Ctx) {
  return runLive<WasmRec>("reach.wasm", ctx, {
    init: wasmInit(),
    run: async (p, h) => {
      await sleep(250);
      const n = Number(p.n) || 100_000_000;
      h.set({ compileMs: 0.4, instMs: 0.2, add: 5, n, wasmMs: n / 1e6 * 0.9, jsMs: n / 1e6 * 1.1, match: true, exports: "add, sum" });
      h.log("(simulated) tiny module ran");
    },
  });
}

function WasmControls({ d, on, send }: CtlProps<WasmRec>) {
  const [n, setN] = useState("100000000");
  return (
    <div className="pc-row">
      <span className="pc-l">Count to</span>
      <Seg data-control="reach.wasm.size" value={n} opts={["10000000", "100000000", "400000000"]} on={on} set={setN} />
      <Run data-control="reach.wasm.run" on={on} running={d.running} onClick={() => send({ n: +n })} label="Compile and run" />
    </div>
  );
}

const WasmInstrument = makeInstrument<WasmRec>({
  wait: "Compiles an 89 byte WebAssembly program inside the page and races it against the same loop in JavaScript.",
  note: "Live: the module bytes are built into the page; nothing is downloaded. The race blocks the page for a moment.",
  Controls: WasmControls,
  rows: (d) => [
    { k: "Module size", v: kbs(d.bytes).replace("0.1 KB", `${d.bytes} bytes`) },
    { k: "Exports", v: d.exports || null },
    { k: "Compile", v: d.compileMs, u: "ms", digits: 2 },
    { k: "Instantiate", v: d.instMs, u: "ms", digits: 2 },
    { k: "add(2, 3)", v: d.add, digits: 0 },
    { k: "WebAssembly loop", v: d.wasmMs, u: "ms", digits: 0, hot: true },
    { k: "JavaScript loop", v: d.jsMs, u: "ms", digits: 0, hot: true },
    { k: "Same answer", v: d.match },
  ],
});

// ---------- WebCodecs ----------

type CodRec = Base & { codec: string; supported: boolean | null; frames: number; chunks: number; keyframes: number; bytes: number; encMs: number | null; perFrame: number | null; fps: number | null; size: string };
const codInit = (): CodRec => ({ ...blank(), codec: "", supported: null, frames: 0, chunks: 0, keyframes: 0, bytes: 0, encMs: null, perFrame: null, fps: null, size: "" });
const CODECS: Record<string, string> = { vp8: "vp8", vp9: "vp09.00.10.08", h264: "avc1.42001f", av1: "av01.0.04M.08" };

function codLive(ctx: Ctx) {
  if (!g.VideoEncoder || !g.VideoFrame) unsupported("WebCodecs VideoEncoder");
  let enc: any = null;
  return runLive<CodRec>("reach.codecs", ctx, {
    init: codInit(),
    run: async (p, h) => {
      const name = String(p.codec || "vp8"), codec = CODECS[name] || name, n = Number(p.frames) || 30, W = 320, H = 240;
      const cfg = { codec, width: W, height: H, bitrate: 600_000, framerate: 30 };
      const sup = await g.VideoEncoder.isConfigSupported(cfg);
      if (!sup.supported) { h.set({ codec: name, supported: false }); throw new Error(`${name} (${codec}) is not supported for encoding here`); }
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const c2 = cv.getContext("2d")!;
      let chunks = 0, keys = 0, bytes = 0;
      enc = new g.VideoEncoder({ output: (ch: any) => { chunks++; bytes += ch.byteLength; if (ch.type === "key") keys++; }, error: (e: any) => h.log("Encoder error: " + errText(e)) });
      enc.configure(sup.config || cfg);
      const t0 = now();
      for (let i = 0; i < n; i++) {
        const gr = c2.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, `hsl(${(i * 9) % 360} 70% 50%)`); gr.addColorStop(1, `hsl(${(i * 9 + 120) % 360} 70% 30%)`);
        c2.fillStyle = gr; c2.fillRect(0, 0, W, H);
        c2.fillStyle = "#fff"; c2.font = "bold 48px sans-serif"; c2.fillText(String(i), 20 + (i * 6) % 200, 120);
        const f = new g.VideoFrame(cv, { timestamp: i * 33_333 });
        enc.encode(f, { keyFrame: i % 15 === 0 });
        f.close();
        if (h.signal.aborted) break;
      }
      await enc.flush();
      const ms = now() - t0;
      enc.close(); enc = null;
      h.set({ codec: name, supported: true, frames: n, chunks, keyframes: keys, bytes, encMs: ms, perFrame: ms / n, fps: n / (ms / 1000), size: `${W}x${H}` });
      h.log(`Encoded ${n} canvas frames as ${name}: ${chunks} chunks, ${kbs(bytes)}, ${keys} key frames, ${(ms / n).toFixed(1)} ms a frame.`);
    },
    restore: () => { try { enc?.close(); } catch { /* already closed */ } enc = null; },
  });
}

function codSim(ctx: Ctx) {
  return runLive<CodRec>("reach.codecs", ctx, {
    init: codInit(),
    run: async (p, h) => {
      await sleep(400);
      const n = Number(p.frames) || 30;
      h.set({ codec: String(p.codec || "vp8"), supported: true, frames: n, chunks: n, keyframes: Math.ceil(n / 15), bytes: n * 2900, encMs: n * 3.2, perFrame: 3.2, fps: 312, size: "320x240" });
      h.log(`(simulated) ${n} frames encoded`);
    },
  });
}

function CodControls({ d, on, send }: CtlProps<CodRec>) {
  const [codec, setCodec] = useState("vp8");
  const [frames, setFrames] = useState(30);
  return (
    <>
      <div className="pc-row"><span className="pc-l">Codec</span><Seg data-control="reach.codecs.codec" value={codec} opts={["vp8", "vp9", "h264", "av1"]} on={on} set={setCodec} /></div>
      <div className="pc-row"><Rng data-control="reach.codecs.frames" label="Frames" value={frames} min={5} max={120} step={5} on={on} set={setFrames} /><Run data-control="reach.codecs.run" on={on} running={d.running} onClick={() => send({ codec, frames })} label="Encode canvas frames" busyLabel="Encoding" /></div>
    </>
  );
}

const CodInstrument = makeInstrument<CodRec>({
  wait: "Draws animated frames on a canvas and compresses them into video with the browser's own encoder.",
  note: "Live: frames are drawn in this tab and encoded by the browser, with hardware help when it has any. Nothing is saved or sent.",
  Controls: CodControls,
  rows: (d) => [
    { k: "Codec", v: d.codec || null },
    { k: "Supported", v: d.supported },
    { k: "Frame size", v: d.size || null },
    { k: "Chunks out", v: d.chunks || null, digits: 0 },
    { k: "Key frames", v: d.chunks ? d.keyframes : null, digits: 0 },
    { k: "Video size", v: d.chunks ? kbs(d.bytes) : null },
    { k: "Time per frame", v: d.perFrame, u: "ms", digits: 1, hot: true },
    { k: "Speed", v: d.fps, u: "fps", digits: 0, hot: true },
  ],
});

// ---------- WebMCP ----------

type McpRec = Base & { present: boolean; registered: boolean; tool: string; calls: number; result: string; testing: boolean; listed: string };
const mcpInit = (): McpRec => ({ ...blank(), present: false, registered: false, tool: "po_console_echo", calls: 0, result: "", testing: false, listed: "" });
const TOOL = "po_console_echo";

function mcpLive(ctx: Ctx) {
  const mc = (navigator as any).modelContext;
  if (!mc || typeof mc.registerTool !== "function") unsupported("navigator.modelContext");
  let reg: any = null;
  let exec: ((a: any) => Promise<any>) | null = null;
  const drop = () => { try { if (reg?.unregister) reg.unregister(); else mc.unregisterTool?.(TOOL); } catch { /* gone already */ } reg = null; };
  const listed = async () => { try { const t = await (navigator as any).modelContextTesting?.listTools?.(); return Array.isArray(t) ? t.map((x: any) => x.name).join(", ") : ""; } catch { return ""; } };
  return runLive<McpRec>("reach.webmcp", ctx, {
    init: { ...mcpInit(), present: true, testing: !!(navigator as any).modelContextTesting }, auto: true,
    run: async (p, h) => {
      const op = p.auto ? "register" : String(p.op || "register");
      if (op === "register" && !reg) {
        let calls = 0;
        exec = async (a: any) => { calls++; h.set({ calls }); return { content: [{ type: "text", text: `echo: ${String(a?.text ?? "")}` }] }; };
        reg = mc.registerTool({ name: TOOL, description: "Echoes back the text it is given. Registered by the platform ontology console demo.", inputSchema: { type: "object", properties: { text: { type: "string", description: "Text to echo" } }, required: ["text"] }, execute: exec }) ?? {};
        h.set({ registered: true, listed: await listed() });
        h.log(`Registered the tool "${TOOL}". An AI agent in this browser can now see and call it.`);
      } else if (op === "unregister") {
        drop(); exec = null;
        h.set({ registered: false, listed: await listed() });
        h.log("Unregistered the tool");
      } else if (op === "call" && exec) {
        const r = await exec({ text: String(p.text || "hello") });
        h.set({ result: r.content[0].text });
        h.log(`Called the tool by hand: ${r.content[0].text}`);
      }
    },
    restore: drop,
  });
}

function mcpSim(ctx: Ctx) {
  return runLive<McpRec>("reach.webmcp", ctx, {
    init: { ...mcpInit(), present: true }, auto: true,
    run: async (p, h) => {
      await sleep(120);
      const op = p.auto ? "register" : String(p.op || "register");
      if (op === "register") { h.set({ registered: true, listed: TOOL }); h.log(`(simulated) registered ${TOOL}`); }
      else if (op === "unregister") { h.set({ registered: false, listed: "" }); }
      else { h.set({ calls: h.st.calls + 1, result: `echo: ${String(p.text || "hello")}` }); h.log("(simulated) tool called"); }
    },
  });
}

function McpControls({ d, on, send }: CtlProps<McpRec>) {
  const [text, setText] = useState("hello agent");
  return (
    <>
      <div className="pc-row">
        <button data-control="reach.webmcp.register" className="btn sm pri" type="button" disabled={!on || d.running || d.registered} onClick={() => send({ op: "register" })}>Register the tool</button>
        <button data-control="reach.webmcp.unregister" className="btn sm" type="button" disabled={!on || d.running || !d.registered} onClick={() => send({ op: "unregister" })}>Remove it</button>
      </div>
      <form className="pc-row" onSubmit={(e) => { e.preventDefault(); send({ op: "call", text }); }}>
        <input data-control="reach.webmcp.text" className="pc-in" value={text} onChange={(e) => setText(e.target.value)} aria-label="Text for the tool" disabled={!on || !d.registered} />
        <button data-control="reach.webmcp.call" className="btn sm" disabled={!on || !d.registered}>Call it</button>
      </form>
    </>
  );
}

const McpInstrument = makeInstrument<McpRec>({
  wait: "Checks for the browser's agent interface and, if present, offers a sample tool that an AI agent could call.",
  note: "Live: a real tool registered with this browser, removed when you stop. Browsers without the API show unsupported.",
  Controls: McpControls,
  rows: (d) => [
    { k: "navigator.modelContext", v: d.present },
    { k: "Test interface", v: d.testing },
    { k: "Sample tool registered", v: d.registered, hot: true },
    { k: "Tools the browser lists", v: d.listed || null },
    { k: "Times called", v: d.calls, digits: 0 },
    { k: "Last result", v: d.result || null },
  ],
});

// ---------- WebRTC data channel ----------

type RtcRec = Base & { conn: string; ice: string; channel: string; msgs: number; size: number | null; rttAvg: number | null; rttMin: number | null; rttMax: number | null; kbs: number | null; setupMs: number | null; cands: number };
const rtcInit = (): RtcRec => ({ ...blank(), conn: "new", ice: "new", channel: "closed", msgs: 0, size: null, rttAvg: null, rttMin: null, rttMax: null, kbs: null, setupMs: null, cands: 0 });

function rtcLive(ctx: Ctx) {
  if (typeof g.RTCPeerConnection === "undefined") unsupported("WebRTC");
  let a: RTCPeerConnection | null = null, b: RTCPeerConnection | null = null, dc: RTCDataChannel | null = null;
  const close = () => { try { dc?.close(); a?.close(); b?.close(); } catch { /* closed */ } a = b = dc = null; };
  return runLive<RtcRec>("reach.datachannel", ctx, {
    init: rtcInit(),
    run: async (p, h) => {
      const size = Number(p.size) || 1024, count = Number(p.count) || 50;
      if (!dc || dc.readyState !== "open") {
        close();
        const t0 = now();
        // No ICE servers: both ends are in this page and talk over local candidates only.
        const pa = (a = new RTCPeerConnection({ iceServers: [] })), pb = (b = new RTCPeerConnection({ iceServers: [] }));
        let cands = 0;
        pa.onicecandidate = (e) => { if (e.candidate) { cands++; h.set({ cands }); void pb.addIceCandidate(e.candidate); } };
        pb.onicecandidate = (e) => { if (e.candidate) void pa.addIceCandidate(e.candidate); };
        const sync = () => h.set({ conn: pa.connectionState, ice: pa.iceConnectionState });
        pa.onconnectionstatechange = sync; pa.oniceconnectionstatechange = sync;
        pb.ondatachannel = (e) => { e.channel.binaryType = "arraybuffer"; e.channel.onmessage = (m) => e.channel.send(m.data); };
        const ch = (dc = pa.createDataChannel("po-demo", { ordered: true }));
        ch.binaryType = "arraybuffer";
        const open = new Promise<void>((res, rej) => { ch.onopen = () => res(); setTimeout(() => rej(new Error("channel did not open in 8 s")), 8000); });
        await pa.setLocalDescription(await pa.createOffer());
        await pb.setRemoteDescription(pa.localDescription!);
        await pb.setLocalDescription(await pb.createAnswer());
        await pa.setRemoteDescription(pb.localDescription!);
        await open;
        h.set({ channel: ch.readyState, setupMs: now() - t0, conn: pa.connectionState, ice: pa.iceConnectionState });
        h.log(`Loopback channel open in ${(now() - t0).toFixed(0)} ms with ${cands} local candidates. Nothing left this page.`);
      }
      const ch = dc!;
      const rtts: number[] = [];
      const buf = new Uint8Array(size);
      const t0 = now();
      for (let i = 0; i < count && !h.signal.aborted; i++) {
        const s = now();
        const echo = new Promise<void>((res) => { ch.onmessage = () => res(); });
        ch.send(buf);
        await echo;
        rtts.push(now() - s);
        if (i % 5 === 0) h.set({ msgs: i + 1, series: rtts.slice(-80) });
      }
      const total = now() - t0;
      h.set({ msgs: rtts.length, size, rttAvg: rtts.reduce((x, y) => x + y, 0) / rtts.length, rttMin: Math.min(...rtts), rttMax: Math.max(...rtts), kbs: (rtts.length * size * 2) / KB / (total / 1000), series: rtts.slice(-80), channel: ch.readyState });
      h.log(`${rtts.length} messages of ${size} bytes sent and echoed back, average round trip ${h.st.rttAvg!.toFixed(2)} ms.`);
    },
    restore: close,
  });
}

function rtcSim(ctx: Ctx) {
  return runLive<RtcRec>("reach.datachannel", ctx, {
    init: rtcInit(),
    run: async (p, h) => {
      await sleep(400);
      const size = Number(p.size) || 1024, count = Number(p.count) || 50;
      const r = Array.from({ length: count }, () => rnd(0.25, 0.9));
      h.set({ conn: "connected", ice: "connected", channel: "open", msgs: count, size, rttAvg: r.reduce((x, y) => x + y, 0) / count, rttMin: Math.min(...r), rttMax: Math.max(...r), kbs: size * 2 / KB / 0.0006, setupMs: 38, cands: 4, series: r });
      h.log("(simulated) loopback channel open, messages echoed");
    },
  });
}

function RtcControls({ d, on, send }: CtlProps<RtcRec>) {
  const [size, setSize] = useState(1024);
  const [count, setCount] = useState(50);
  return (
    <>
      <div className="pc-row"><Rng data-control="reach.datachannel.message-size" label="Message" value={size} min={16} max={65536} step={16} unit="bytes" on={on} set={setSize} /></div>
      <div className="pc-row"><Rng data-control="reach.datachannel.messages" label="Messages" value={count} min={10} max={500} step={10} on={on} set={setCount} /><Run data-control="reach.datachannel.run" on={on} running={d.running} onClick={() => send({ size, count })} label="Connect and ping" busyLabel="Pinging" /></div>
    </>
  );
}

const RtcInstrument = makeInstrument<RtcRec>({
  wait: "Connects two peers that both live in this page and bounces messages between them over a data channel.",
  note: "Live: a real peer connection with no outside servers, so no data leaves this page. Stop closes both ends.",
  Controls: RtcControls,
  spark: "Round trip per message, ms",
  rows: (d) => [
    { k: "Connection", v: d.conn },
    { k: "ICE state", v: d.ice },
    { k: "Channel", v: d.channel },
    { k: "Setup time", v: d.setupMs, u: "ms", digits: 0 },
    { k: "Messages echoed", v: d.msgs, digits: 0 },
    { k: "Round trip, average", v: d.rttAvg, u: "ms", digits: 2, hot: true },
    { k: "Round trip, best and worst", v: d.rttMin === null || d.rttMax === null ? null : `${d.rttMin.toFixed(2)} and ${d.rttMax.toFixed(2)} ms` },
    { k: "Throughput", v: d.kbs, u: "KB/s", digits: 0, hot: true },
  ],
});

// ---------- WebSocket and WebTransport (detect only) ----------

type DetRec = Base & { facts: { k: string; v: string | boolean | number | null }[] };
const detInit = (): DetRec => ({ ...blank(), facts: [] });

function detect(id: string, ctx: Ctx, what: string, read: () => Promise<DetRec["facts"]> | DetRec["facts"], simFacts?: DetRec["facts"]) {
  return runLive<DetRec>(id, ctx, {
    init: detInit(), auto: true,
    run: async (_p, h) => {
      if (simFacts) { await sleep(120); h.set({ facts: simFacts }); h.log(`(simulated) ${what} checked`); return; }
      const facts = await read();
      h.set({ facts });
      h.log(`${what}: ${facts.filter((f) => f.v === true).length} of ${facts.filter((f) => typeof f.v === "boolean").length} features present. No connection was opened.`);
    },
  });
}

const wsFacts = (): DetRec["facts"] => [
  { k: "WebSocket", v: typeof g.WebSocket === "function" },
  { k: "WebSocketStream", v: typeof g.WebSocketStream === "function" },
  { k: "Page protocol", v: location.protocol.replace(":", "") },
  { k: "Plain ws:// from this page", v: location.protocol === "https:" ? "blocked as mixed content" : "allowed" },
  { k: "wss:// from this page", v: "allowed" },
  { k: "Needs a prompt", v: false },
  { k: "Echo server", v: "none used by this project" },
];

const wtFacts = (): DetRec["facts"] => [
  { k: "WebTransport", v: typeof g.WebTransport === "function" },
  { k: "Bidirectional streams", v: typeof g.WebTransportBidirectionalStream === "function" },
  { k: "Datagrams", v: typeof g.WebTransportDatagramDuplexStream === "function" },
  { k: "Secure context (required)", v: !!g.isSecureContext },
  { k: "Reliable only mode", v: typeof g.WebTransport?.supportsReliableOnly === "boolean" ? g.WebTransport.supportsReliableOnly : null },
  { k: "Needs a prompt", v: false },
  { k: "Server", v: "none used by this project" },
];

const DetInstrument = (wait: string, note: string) => makeInstrument<DetRec>({
  wait, note,
  Controls: ({ d, on, send, sid }) => <OnlyRun data-control={`${sid}.check-again`} on={on} d={d} send={send} label="Check again" />,
  rows: (d) => d.facts.map((f, i) => ({ k: f.k, v: f.v, hot: i === 0 })),
});

// ---------- WebAuthn signal API (detect only) ----------

function authFacts(): Promise<DetRec["facts"]> | DetRec["facts"] {
  const P = g.PublicKeyCredential;
  if (!P) unsupported("WebAuthn (PublicKeyCredential)");
  const f: DetRec["facts"] = [
    { k: "PublicKeyCredential", v: true },
    { k: "signalUnknownCredential", v: typeof P.signalUnknownCredential === "function" },
    { k: "signalAllAcceptedCredentials", v: typeof P.signalAllAcceptedCredentials === "function" },
    { k: "signalCurrentUserDetails", v: typeof P.signalCurrentUserDetails === "function" },
  ];
  // Read only questions: none of these touch a credential.
  const ask = async (k: string, fn?: () => Promise<unknown>) => { try { f.push({ k, v: fn ? !!(await fn()) : null }); } catch { f.push({ k, v: null }); } };
  return (async () => {
    await ask("Built in authenticator", P.isUserVerifyingPlatformAuthenticatorAvailable?.bind(P));
    await ask("Passkey autofill", P.isConditionalMediationAvailable?.bind(P));
    try {
      const caps = await P.getClientCapabilities?.();
      if (caps) for (const [k, v] of Object.entries(caps).slice(0, 12)) f.push({ k: "Capability " + k, v: v as boolean });
    } catch { /* not offered */ }
    return f;
  })();
}

// ---------- Run on login (detect only) ----------

async function loginFacts(): Promise<DetRec["facts"]> {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  let display = "", start = "", ovr = "";
  if (link) {
    try { const m = await (await fetch(link.href, { cache: "no-store" })).json(); display = m.display || "browser"; start = m.start_url || ""; ovr = (m.display_override || []).join(", "); } catch { display = "unreadable"; }
  }
  const mode = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"].find((m) => matchMedia(`(display-mode: ${m})`).matches) || "browser tab";
  let related: boolean | null = null;
  try { related = typeof (navigator as any).getInstalledRelatedApps === "function" ? ((await (navigator as any).getInstalledRelatedApps()) as unknown[]).length > 0 : null; } catch { related = null; }
  return [
    { k: "Can a page start itself at login", v: false },
    { k: "Web app manifest linked", v: !!link },
    { k: "Manifest display", v: display || null },
    { k: "Display override", v: ovr || null },
    { k: "Start URL", v: start || null },
    { k: "Running as", v: mode },
    { k: "Installed, per related apps", v: related },
    { k: "Launch queue (installed apps)", v: typeof g.launchQueue === "object" },
    { k: "Install prompt event", v: typeof (g as any).BeforeInstallPromptEvent === "function" },
    { k: "Who controls login start", v: "the install setting or an admin policy" },
  ];
}

// ---------- Registry ----------

const base = { passive: true, layer: 1 as const, modes: { detect: "Reads what this browser supports.", create: "Runs a small real job in this tab and measures it." } };
const act = (s: Omit<ScopeDef, "passive" | "layer" | "modes">): ScopeDef => ({ ...base, ...s });

export const pageActionComputeScopes: ScopeDef[] = [
  act({
    id: "reach.compression", name: "Compress data", domain: "reach", atlas: ["web.actions.compression-streams"], icon: FileArchive,
    summary: "Compresses bytes with the browser's built in gzip, unpacks them and checks the result.",
    call: "new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))",
    reveals: ["How fast this device is at raw number crunching", "A page can shrink data before sending it, with no library"],
    live: async (ctx) => compLive(ctx), sim: compSim, Instrument: CompInstrument,
  }),
  act({
    id: "reach.isolation", name: "Cross origin isolation", domain: "reach", atlas: ["web.actions.cross-origin-isolation"], icon: Layers,
    summary: "Reports whether this page is isolated, whether shared memory is allowed and how fine its timer is.",
    call: "crossOriginIsolated; new SharedArrayBuffer(8)",
    reveals: ["Whether the page may share memory between threads", "How precise a clock the page gets, which sharpens timing attacks and fingerprints"],
    live: async (ctx) => isoLive(ctx), sim: isoSim, Instrument: IsoInstrument,
  }),
  act({
    id: "reach.timer-throttle", name: "Hidden tab timer drift", domain: "reach", atlas: ["web.actions.page-visibility-throttling"], icon: Timer,
    summary: "Runs a timer and measures how the browser slows it once you switch to another tab.",
    call: "setTimeout(tick, 250); document.hidden",
    reveals: ["Whether you are looking at this tab, from the timer gaps alone", "How hard the browser throttles background pages"],
    live: async (ctx) => throttleCore("reach.timer-throttle", ctx, false), sim: (ctx) => throttleCore("reach.timer-throttle", ctx, true), Instrument: ThrInstrument,
  }),
  act({
    id: "reach.scheduler", name: "Task scheduler", domain: "reach", atlas: ["web.actions.scheduler"], icon: Gauge,
    summary: "Posts tasks at three priorities, aborts one and shows how yielding keeps the page responsive.",
    call: "scheduler.postTask(fn, { priority }); await scheduler.yield()",
    reveals: ["Which scheduling APIs this browser has, a quiet browser fingerprint", "Whether the page is busy: input pending checks"],
    live: async (ctx) => schLive(ctx), sim: schSim, Instrument: SchInstrument,
  }),
  act({
    id: "reach.beacon", name: "Send after leaving", domain: "reach", atlas: ["web.actions.send-beacon"], icon: Send,
    summary: "Queues a request the browser delivers even if the tab closes, and shows the server's answer.",
    call: "navigator.sendBeacon('/api/ingest', blob)",
    reveals: ["A page can report how long you stayed, after you leave", "Closing the tab does not stop data from being sent"],
    live: async (ctx) => beaLive(ctx), sim: beaSim, Instrument: BeaInstrument,
  }),
  act({
    id: "reach.cache", name: "Offline cache", domain: "reach", atlas: ["web.actions.service-worker-cache"], icon: Archive,
    summary: "Stores and reads whole responses in the browser's cache and lists every cache this site owns.",
    call: "caches.open(name).then(c => c.put(request, response))",
    reveals: ["How much a site has stored on this device", "Pages that keep working with the network off"],
    live: async (ctx) => cacheLive(ctx), sim: cacheSim, Instrument: CacheInstrument,
  }),
  act({
    id: "reach.prefetch", name: "Prefetch a page", domain: "reach", atlas: ["web.actions.speculation-rules"], icon: Rocket,
    summary: "Adds a prefetch rule for a page on this site and shows the rule the browser reads.",
    call: "<script type=\"speculationrules\">{\"prefetch\":[…]}</script>",
    reveals: ["A page can make your browser load other pages before you ask", "Which links a site expects you to click next"],
    live: async (ctx) => specLive(ctx), sim: specSim, Instrument: SpecInstrument,
  }),
  act({
    id: "reach.crypto", name: "Crypto engine", domain: "reach", atlas: ["web.actions.web-crypto"], icon: KeyRound,
    summary: "Hashes data, makes a signing key, signs and verifies, then encrypts and decrypts, timing each step.",
    call: "crypto.subtle.digest('SHA-256', data); generateKey(); sign()",
    reveals: ["Hardware speed hints from the timings", "A page can keep keys the browser will never hand back"],
    live: async (ctx) => cryLive(ctx), sim: crySim, Instrument: CryInstrument,
  }),
  act({
    id: "reach.workers", name: "Background threads", domain: "reach", atlas: ["web.actions.web-workers"], icon: Cpu,
    summary: "Counts primes on one worker then several, and shows the speed up and whether the page froze.",
    call: "new Worker(url).postMessage(job)",
    reveals: ["How many CPU cores you have, and how many are really free", "A page can use your processor in the background without any prompt"],
    live: async (ctx) => workLive(ctx), sim: workSim, Instrument: WorkInstrument,
  }),
  act({
    id: "reach.wasm", name: "WebAssembly", domain: "reach", atlas: ["web.actions.webassembly"], icon: Binary,
    summary: "Compiles an 89 byte program inside the page and races it against the same loop in JavaScript.",
    call: "WebAssembly.instantiate(bytes)",
    reveals: ["Raw CPU speed, almost free of browser overhead", "A page can run compiled native style code from a few bytes"],
    live: async (ctx) => wasmLive(ctx), sim: wasmSim, Instrument: WasmInstrument,
  }),
  act({
    id: "reach.codecs", name: "Video encoder", domain: "reach", atlas: ["web.actions.webcodecs"], icon: Film,
    summary: "Draws frames on a canvas and compresses them into video with the browser's encoder.",
    call: "new VideoEncoder({ output, error }).encode(new VideoFrame(canvas))",
    reveals: ["Which video codecs and hardware encoders this device has", "A page can record and compress video itself"],
    live: async (ctx) => codLive(ctx), sim: codSim, Instrument: CodInstrument,
  }),
  act({
    id: "reach.webmcp", name: "Agent tools", domain: "reach", atlas: ["web.actions.webmcp-model-context"], icon: Bot,
    summary: "Registers a sample tool with the browser's agent interface, where an AI agent can see and call it.",
    call: "navigator.modelContext.registerTool({ name, inputSchema, execute })",
    reveals: ["Whether this browser lets AI agents act on pages", "A page can decide what an agent is allowed to do on it"],
    live: async (ctx) => mcpLive(ctx), sim: mcpSim, Instrument: McpInstrument,
  }),
  act({
    id: "reach.datachannel", name: "Peer data channel", domain: "reach", atlas: ["web.actions.webrtc-data-channel"], icon: Network,
    summary: "Connects two peers inside this page and measures messages bounced between them.",
    call: "new RTCPeerConnection().createDataChannel('x')",
    reveals: ["Local network addresses, which WebRTC can expose even without a prompt", "A direct line to another browser, no server in between"],
    live: async (ctx) => rtcLive(ctx), sim: rtcSim, Instrument: RtcInstrument,
  }),
  act({
    id: "reach.websocket", name: "WebSocket", domain: "reach", atlas: ["web.actions.websockets"], icon: Cable,
    summary: "Checks the WebSocket features this browser has. No connection is made, as the project has no echo server.",
    call: "typeof WebSocket; typeof WebSocketStream",
    reveals: ["A page can hold a connection open and talk to a server in real time, with no prompt"],
    live: async (ctx) => detect("reach.websocket", ctx, "WebSocket", wsFacts), sim: (ctx) => detect("reach.websocket", ctx, "WebSocket", wsFacts, [{ k: "WebSocket", v: true }, { k: "WebSocketStream", v: true }, { k: "Page protocol", v: "https" }, { k: "Plain ws:// from this page", v: "blocked as mixed content" }, { k: "Needs a prompt", v: false }]),
    Instrument: DetInstrument("Checks which WebSocket features this browser has, without opening a connection.", "Live: only feature checks ran. No socket was opened."),
  }),
  act({
    id: "reach.webtransport", name: "WebTransport", domain: "reach", atlas: ["web.actions.webtransport"], icon: Boxes,
    summary: "Checks the WebTransport features this browser has. No connection is made, as the project has no server for it.",
    call: "typeof WebTransport",
    reveals: ["A page can open fast two way streams and datagrams over HTTP/3, with no prompt"],
    live: async (ctx) => detect("reach.webtransport", ctx, "WebTransport", wtFacts), sim: (ctx) => detect("reach.webtransport", ctx, "WebTransport", wtFacts, [{ k: "WebTransport", v: true }, { k: "Bidirectional streams", v: true }, { k: "Datagrams", v: true }, { k: "Secure context (required)", v: true }, { k: "Needs a prompt", v: false }]),
    Instrument: DetInstrument("Checks which WebTransport features this browser has, without opening a connection.", "Live: only feature checks ran. No session was opened."),
  }),
  act({
    id: "identity.webauthn-signal", name: "Passkey signals", domain: "identity", atlas: ["web.identity.webauthn-signal-api"], icon: Fingerprint,
    summary: "Checks whether this browser lets a page tell the passkey manager about removed or renamed credentials.",
    call: "typeof PublicKeyCredential.signalUnknownCredential",
    reveals: ["Whether a built in passkey manager is present", "Passkey features and the capabilities this device reports"],
    live: async (ctx) => detect("identity.webauthn-signal", ctx, "Passkey signals", authFacts), sim: (ctx) => detect("identity.webauthn-signal", ctx, "Passkey signals", authFacts, [{ k: "PublicKeyCredential", v: true }, { k: "signalUnknownCredential", v: true }, { k: "signalAllAcceptedCredentials", v: true }, { k: "signalCurrentUserDetails", v: true }, { k: "Built in authenticator", v: true }, { k: "Passkey autofill", v: true }]),
    Instrument: DetInstrument("Checks the passkey signal methods and what this device can do with passkeys. No credential is touched.", "Live: feature checks and read only capability questions. Nothing was signalled and no credential changed."),
  }),
  act({
    id: "reach.login-item", name: "Start at login", domain: "reach", atlas: ["web.os.run-on-os-login"], icon: Power,
    summary: "Reads the install facts a page can see. Starting at login itself is an install setting, not a page call.",
    call: "link[rel=manifest]; matchMedia('(display-mode: standalone)')",
    reveals: ["Whether this app is installed and how it is launched", "That no page can add itself to your login items"],
    live: async (ctx) => detect("reach.login-item", ctx, "Start at login", loginFacts), sim: (ctx) => detect("reach.login-item", ctx, "Start at login", loginFacts, [{ k: "Can a page start itself at login", v: false }, { k: "Web app manifest linked", v: true }, { k: "Manifest display", v: "standalone" }, { k: "Running as", v: "browser tab" }, { k: "Who controls login start", v: "the install setting or an admin policy" }]),
    Instrument: DetInstrument("Reads the manifest and install state. There is no web call that starts an app at login.", "Live: only reads this page's manifest and display mode."),
  }),
];
