import type { Ctx, InstrumentProps, ScopeDef } from "../core/types";
import { every, noise, series, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Gauge, Readout, Scope, Spark, Stat, Waiting, fmt, lastData } from "../ui/kit";
import "./capture-device-fp.css";

// Device: battery, spec sheet, storage, CPU pressure, screens. All but screens are passive.

const COLOR = DOMAIN_COLOR.device;
const win = () => window as any;
const nav = () => navigator as any;

// ---------- Battery ----------

type BattRec = { level: number; charging: boolean; charging_time: number | null; discharging_time: number | null };

const finite = (n: number) => (isFinite(n) ? n : null);
const hm = (s: number | null | undefined) => (s == null ? "n/a" : `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`);

async function batteryLive(ctx: Ctx) {
  if (!nav().getBattery) unsupported("Battery Status API");
  const b = await nav().getBattery();
  ctx.granted();
  const push = () => ctx.emit({ level: Math.round(b.level * 1000) / 10, charging: b.charging, charging_time: finite(b.chargingTime), discharging_time: finite(b.dischargingTime) } satisfies BattRec);
  const evs = ["levelchange", "chargingchange", "chargingtimechange", "dischargingtimechange"];
  evs.forEach((e) => b.addEventListener(e, push));
  const timer = every(2000, push);
  return () => { timer(); evs.forEach((e) => b.removeEventListener(e, push)); };
}

function batterySim(ctx: Ctx) {
  ctx.granted();
  let level = 63;
  let charging = false;
  let n = 0;
  return every(1000, () => {
    n++;
    if (n % 40 === 0) charging = !charging;
    level = Math.max(4, Math.min(100, level + (charging ? 0.35 : -0.22) + noise(0.05)));
    ctx.emit({ level: +level.toFixed(1), charging, charging_time: charging ? Math.round(((100 - level) / 0.35) * 40) : null, discharging_time: charging ? null : Math.round((level / 0.22) * 40) } satisfies BattRec);
  });
}

function BatteryInstrument({ session }: InstrumentProps) {
  const d = lastData<BattRec>(session);
  return (
    <Frame
      visual={d ? (
        <div className="cdf-batt">
          <Gauge value={d.level / 100} label={`${fmt(d.level, 0)}%`} sub={d.charging ? "charging" : "on battery"} color={d.level < 20 && !d.charging ? C.err : d.charging ? C.ok : COLOR} size={200} />
          <div className="cdf-batt-spark"><Spark values={series(session.records, "level", 120)} w={420} h={60} color={COLOR} min={0} max={100} /></div>
          <p className="cdf-note">Level, charging state and time estimates together act as a short lived identifier: two sites reading them at the same moment can tell it is the same device.</p>
        </div>
      ) : <Waiting session={session} what="A gauge of your battery level and charging state. No prompt." />}
      side={<Readout rows={[
        { k: "Level", v: d?.level ?? null, u: "%", digits: 1, hot: true },
        { k: "Charging", v: d?.charging ?? null },
        { k: "Time to full", v: d ? hm(d.charging_time) : null },
        { k: "Time to empty", v: d ? hm(d.discharging_time) : null },
      ]} />}
    />
  );
}

// ---------- Profile (spec sheet) ----------

type ProfRec = {
  cores: number | null; memory: number | null; platform: string; brands: string; model: string; arch: string; os_version: string;
  screen_w: number; screen_h: number; avail_w: number; avail_h: number; dpr: number; color_depth: number; touch: number; lang: string; tz: string; ua: string; bits: number;
};

/** Rough bits of identifying information, from published browser fingerprint studies. */
function profBits(p: Omit<ProfRec, "bits">) {
  let b = 0;
  if (p.cores) b += 2.2;
  if (p.memory) b += 1.4;
  b += 4.6; // screen size
  b += p.dpr !== 1 ? 1.6 : 0.4;
  b += 0.6; // color depth
  b += p.touch > 0 ? 1.2 : 0.5;
  b += 3.2; // timezone
  b += 2.3; // language list
  b += p.model || p.arch ? 3.5 : 0;
  return b;
}

async function profLive(ctx: Ctx) {
  const n = nav();
  let he: any = {};
  const read = (): ProfRec => {
    const p = {
      cores: n.hardwareConcurrency ?? null, memory: n.deviceMemory ?? null, platform: n.userAgentData?.platform || n.platform || "n/a",
      brands: (n.userAgentData?.brands || []).filter((x: any) => !/not.?a.?brand/i.test(x.brand)).map((x: any) => `${x.brand} ${x.version}`).join(", ") || "n/a",
      model: he.model || "", arch: he.architecture ? `${he.architecture}${he.bitness ? " " + he.bitness + "-bit" : ""}` : "", os_version: he.platformVersion || "",
      screen_w: screen.width, screen_h: screen.height, avail_w: screen.availWidth, avail_h: screen.availHeight, dpr: window.devicePixelRatio, color_depth: screen.colorDepth,
      touch: n.maxTouchPoints || 0, lang: n.language || "", tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ua: n.userAgent,
    };
    return { ...p, bits: profBits(p) };
  };
  ctx.granted();
  ctx.emit(read());
  if (n.userAgentData?.getHighEntropyValues) {
    try {
      he = await n.userAgentData.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "fullVersionList"]);
      ctx.log("high entropy client hints returned without any prompt");
    } catch { /* blocked */ }
  }
  return every(3000, () => ctx.emit(read()));
}

function profSim(ctx: Ctx) {
  ctx.granted();
  const p = {
    cores: 10, memory: 8, platform: "macOS", brands: "Chromium 130, Google Chrome 130", model: "", arch: "arm 64-bit", os_version: "15.1.0",
    screen_w: 1512, screen_h: 982, avail_w: 1512, avail_h: 949, dpr: 2, color_depth: 30, touch: 0, lang: "en-US", tz: "America/Chicago",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };
  return every(3000, () => ctx.emit({ ...p, bits: profBits(p) } satisfies ProfRec));
}

function ProfileInstrument({ session }: InstrumentProps) {
  const d = lastData<ProfRec>(session);
  const groups: [string, [string, unknown, string?][]][] = d ? [
    ["Compute", [["CPU threads", d.cores], ["Memory", d.memory, "GB"], ["Architecture", d.arch || "hidden"], ["Model", d.model || "hidden"]]],
    ["Display", [["Screen", `${d.screen_w} x ${d.screen_h}`], ["Usable", `${d.avail_w} x ${d.avail_h}`], ["Pixel ratio", d.dpr], ["Color depth", d.color_depth, "bit"], ["Touch points", d.touch]]],
    ["Software", [["Platform", d.platform], ["OS version", d.os_version || "hidden"], ["Browser", d.brands], ["Language", d.lang], ["Time zone", d.tz]]],
  ] : [];
  return (
    <Frame
      visual={d ? (
        <div className="cdf-specs">
          {groups.map(([h, items]) => (
            <div key={h}>
              <h4>{h}</h4>
              <div className="cdf-specs-grid">{items.map(([l, v, u]) => <Stat key={l} label={l} value={v} unit={u} digits={1} />)}</div>
            </div>
          ))}
          <p className="cdf-note">{d.ua}</p>
        </div>
      ) : <Waiting session={session} what="A spec sheet of everything the browser volunteers about your hardware. No prompt." />}
      side={<Readout rows={[{ k: "Identifying info", v: d?.bits ?? null, u: "bits", digits: 1, hot: true }, { k: "Matches 1 in", v: d ? Math.round(Math.pow(2, d.bits)) : null, digits: 0 }, { k: "Prompt shown", v: false }]} />}
    />
  );
}

// ---------- Storage ----------

type StoreRec = { usage: number; quota: number; pct: number; persisted: boolean | null; details: { name: string; bytes: number }[] };
const MB = 1024 * 1024;
const human = (b: number) => (b >= 1e9 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1e6 ? `${(b / MB).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const PAL = ["#57606a", "#1f6feb", "#0a9396", "#c99a06", "#8250df", "#bf3989"];

async function storageLive(ctx: Ctx) {
  if (!nav().storage?.estimate) unsupported("StorageManager");
  const read = async () => {
    const e: any = await nav().storage.estimate();
    const persisted: boolean | null = nav().storage.persisted ? await nav().storage.persisted() : null;
    const details = Object.entries(e.usageDetails || {}).map(([name, bytes]) => ({ name, bytes: bytes as number })).filter((x) => x.bytes > 0);
    ctx.emit({ usage: e.usage || 0, quota: e.quota || 0, pct: e.quota ? ((e.usage || 0) / e.quota) * 100 : 0, persisted, details } satisfies StoreRec);
  };
  ctx.granted();
  await read();
  return every(3000, () => void read());
}

function storageSim(ctx: Ctx) {
  ctx.granted();
  let usage = 412 * MB;
  const quota = 296 * 1024 * MB;
  return every(1500, () => {
    usage += (Math.random() * 3 + 0.5) * MB;
    ctx.emit({ usage, quota, pct: (usage / quota) * 100, persisted: false, details: [{ name: "indexedDB", bytes: usage * 0.46 }, { name: "caches", bytes: usage * 0.38 }, { name: "serviceWorkerRegistrations", bytes: usage * 0.02 }] } satisfies StoreRec);
  });
}

function StorageInstrument({ session }: InstrumentProps) {
  const d = lastData<StoreRec>(session);
  const R = 38;
  const CIRC = 2 * Math.PI * R;
  let off = 0;
  const segs = d ? [...d.details.map((x, i) => ({ ...x, color: PAL[(i + 1) % PAL.length] })), ...(d.usage - d.details.reduce((a, x) => a + x.bytes, 0) > 1024 ? [{ name: "other", bytes: d.usage - d.details.reduce((a, x) => a + x.bytes, 0), color: PAL[0] }] : [])] : [];
  return (
    <Frame
      visual={d ? (
        <div>
          <div className="cdf-donut-wrap">
            <svg viewBox="0 0 100 100" className="cdf-donut">
              <circle cx="50" cy="50" r={R} fill="none" stroke={C.line} strokeWidth="10" />
              {segs.map((s) => {
                const len = Math.max(0.4, (s.bytes / d.quota) * CIRC);
                const el = <circle key={s.name} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="10" strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" />;
                off += len;
                return el;
              })}
              <text x="50" y="52" textAnchor="middle" className="cdf-donut-v">{human(d.usage)}</text>
              <text x="50" y="62" textAnchor="middle" className="cdf-donut-s">of {human(d.quota)} quota</text>
            </svg>
            <div className="cdf-legend">
              {segs.map((s) => <div key={s.name}><span><i style={{ background: s.color }} />{s.name}</span><b>{human(s.bytes)}</b></div>)}
              <div><span><i style={{ background: C.line }} />free to the page</span><b>{human(Math.max(0, d.quota - d.usage))}</b></div>
            </div>
          </div>
          <p className="cdf-note">Quota is roughly a share of your free disk, so it leaks how big your drive is. Browsers blur the number in private windows.</p>
        </div>
      ) : <Waiting session={session} what="A donut of how much disk this site uses against its quota. No prompt." />}
      side={
        <>
          <Readout rows={[
            { k: "Used", v: d ? human(d.usage) : null, hot: true },
            { k: "Quota", v: d ? human(d.quota) : null },
            { k: "Share used", v: d?.pct ?? null, u: "%", digits: 3 },
            { k: "Persistent", v: d?.persisted ?? null },
          ]} />
          <Spark values={series(session.records, "usage", 80)} w={220} h={30} color={COLOR} />
        </>
      }
    />
  );
}

// ---------- CPU pressure ----------

type PressRec = { state: string; level: number; load: number; bench_ms: number | null; mode: string };
const STATES = ["nominal", "fair", "serious", "critical"];
const STATE_COLOR = [C.ok, "#c99a06", "#f76b15", C.err];

function bench() {
  const t = performance.now();
  let x = 0;
  for (let i = 1; i < 600000; i++) x += Math.sqrt(i) * Math.sin(i);
  if (x === 0.5) console.debug(x);
  return performance.now() - t;
}

async function pressureLive(ctx: Ctx) {
  const PO = win().PressureObserver;
  if (PO) {
    try {
      const obs = new PO((records: any[]) => {
        const r = records[records.length - 1];
        const level = Math.max(0, STATES.indexOf(r.state));
        ctx.emit({ state: r.state, level, load: level, bench_ms: null, mode: "PressureObserver" } satisfies PressRec);
      }, { sampleInterval: 1000 });
      await obs.observe("cpu", { sampleInterval: 1000 });
      ctx.granted();
      ctx.log("PressureObserver is watching the CPU");
      return () => obs.disconnect();
    } catch (e: any) {
      if (e?.name === "NotAllowedError") throw e;
      ctx.log(`PressureObserver refused (${e?.name || "error"}); falling back to a timing benchmark`);
    }
  } else ctx.log("PressureObserver is not available; using a timing benchmark as a load proxy");
  ctx.granted();
  let base = Infinity;
  return every(2000, () => {
    const ms = bench();
    base = Math.min(base, ms);
    const ratio = ms / base;
    const level = ratio < 1.3 ? 0 : ratio < 2 ? 1 : ratio < 3.5 ? 2 : 3;
    ctx.emit({ state: STATES[level], level, load: ratio, bench_ms: ms, mode: "timing benchmark" } satisfies PressRec);
  });
}

function pressureSim(ctx: Ctx) {
  ctx.granted();
  let lvl = 0.4;
  return every(1000, () => {
    lvl = Math.max(0, Math.min(3.4, lvl + noise(0.35) + (Math.random() < 0.05 ? 1.2 : 0) - 0.04));
    const level = Math.floor(lvl);
    ctx.emit({ state: STATES[level], level, load: lvl, bench_ms: null, mode: "simulated" } satisfies PressRec);
  });
}

function PressureInstrument({ session }: InstrumentProps) {
  const d = lastData<PressRec>(session);
  const levels = series(session.records, "level", 60);
  return (
    <Frame
      visual={d ? (
        <div>
          <p className="cdf-state" style={{ color: STATE_COLOR[d.level] }}>{d.state}</p>
          <div className="cdf-tl">{levels.map((l, i) => <i key={i} style={{ background: STATE_COLOR[l], opacity: 0.35 + (i / levels.length) * 0.65 }} />)}</div>
          <div className="cdf-tl-key">{STATES.map((s, i) => <span key={s}><i style={{ background: STATE_COLOR[i] }} />{s}</span>)}</div>
          <Scope series={[{ label: d.bench_ms != null ? "load ratio" : "level", values: series(session.records, "load", 90), color: COLOR }]} min={0} />
          <p className="cdf-note">{d.mode === "timing benchmark" ? "No pressure API here, so the page times a fixed bit of math. A slow run means something else is busy." : "Pages can tell when you start a video call, a game or a build."}</p>
        </div>
      ) : <Waiting session={session} what="A timeline of how hard your processor is working. No prompt." />}
      side={<Readout rows={[{ k: "State", v: d?.state ?? null, hot: true }, { k: "Source", v: d?.mode ?? null }, { k: "Benchmark", v: d?.bench_ms ?? null, u: "ms", digits: 1 }, { k: "Load", v: d?.load ?? null, digits: 2 }]} />}
    />
  );
}

// ---------- Screens ----------

type Scr = { label: string; left: number; top: number; width: number; height: number; primary: boolean; internal: boolean | null; dpr: number; current: boolean };
type ScrRec = { screens: Scr[]; count: number; extended: boolean; mode: string };

async function screensLive(ctx: Ctx) {
  const w = win();
  const one = (): Scr[] => [{ label: "This screen", left: (screen as any).availLeft ?? 0, top: (screen as any).availTop ?? 0, width: screen.width, height: screen.height, primary: true, internal: null, dpr: devicePixelRatio, current: true }];
  if (!w.getScreenDetails) {
    ctx.log("Window Management API is not available; showing the single screen the browser reports");
    ctx.granted();
    const t = every(3000, () => ctx.emit({ screens: one(), count: 1, extended: !!(screen as any).isExtended, mode: "single screen" } satisfies ScrRec));
    return t;
  }
  const details = await w.getScreenDetails();
  ctx.granted();
  const push = () => {
    const screens: Scr[] = details.screens.map((s: any) => ({
      label: s.label || "Screen", left: s.left, top: s.top, width: s.width, height: s.height, primary: !!s.isPrimary, internal: s.isInternal ?? null, dpr: s.devicePixelRatio, current: s === details.currentScreen,
    }));
    ctx.emit({ screens, count: screens.length, extended: screens.length > 1, mode: "getScreenDetails" } satisfies ScrRec);
  };
  details.addEventListener("screenschange", push);
  const t = every(3000, push);
  return () => { t(); details.removeEventListener("screenschange", push); };
}

function screensSim(ctx: Ctx) {
  ctx.granted();
  const screens: Scr[] = [
    { label: "Built-in Retina Display", left: 0, top: 0, width: 1512, height: 982, primary: true, internal: true, dpr: 2, current: true },
    { label: "DELL U2723QE", left: 1512, top: -458, width: 2560, height: 1440, primary: false, internal: false, dpr: 1, current: false },
    { label: "LG UltraFine", left: -1080, top: -300, width: 1080, height: 1920, primary: false, internal: false, dpr: 1, current: false },
  ];
  return every(3000, () => ctx.emit({ screens, count: 3, extended: true, mode: "simulated" } satisfies ScrRec));
}

function ScreensInstrument({ session }: InstrumentProps) {
  const d = lastData<ScrRec>(session);
  let vb = "0 0 100 60";
  if (d) {
    const x0 = Math.min(...d.screens.map((s) => s.left));
    const y0 = Math.min(...d.screens.map((s) => s.top));
    const x1 = Math.max(...d.screens.map((s) => s.left + s.width));
    const y1 = Math.max(...d.screens.map((s) => s.top + s.height));
    const pad = Math.max(x1 - x0, y1 - y0) * 0.04;
    vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
  }
  const k = d ? Math.max(...d.screens.map((s) => s.width)) / 100 : 1;
  return (
    <Frame
      visual={d ? (
        <div>
          <svg viewBox={vb} className="cdf-screens">
            {d.screens.map((s, i) => (
              <g key={i}>
                <rect x={s.left} y={s.top} width={s.width} height={s.height} fill={s.current ? C.line2 : C.bg} stroke={s.primary ? C.ink : C.mute} strokeWidth={k * 0.35} rx={k * 0.8} />
                <text x={s.left + s.width / 2} y={s.top + s.height / 2 - k * 1.5} textAnchor="middle" className="cdf-scr-label" style={{ fontSize: k * 5 }}>{s.label.length > 22 ? s.label.slice(0, 21) + "..." : s.label}</text>
                <text x={s.left + s.width / 2} y={s.top + s.height / 2 + k * 5} textAnchor="middle" className="cdf-scr-sub" style={{ fontSize: k * 4 }}>{s.width} x {s.height}{s.primary ? " , primary" : ""}</text>
                <text x={s.left + s.width / 2} y={s.top + s.height / 2 + k * 10.5} textAnchor="middle" className="cdf-scr-sub" style={{ fontSize: k * 3.4 }}>at {s.left}, {s.top}{s.current ? " , this window" : ""}</text>
              </g>
            ))}
          </svg>
          <p className="cdf-note">{d.mode === "single screen" ? "Only the current screen is visible without the Window Management permission." : "Positions show how your monitors are arranged on your desk."}</p>
        </div>
      ) : <Waiting session={session} what="Every connected screen, drawn where it sits. Chrome asks for Window Management permission." />}
      side={<Readout rows={[{ k: "Screens", v: d?.count ?? null, hot: true, digits: 0 }, { k: "Extended desktop", v: d?.extended ?? null }, { k: "Method", v: d?.mode ?? null }]} />}
    />
  );
}

export const deviceScopes: ScopeDef[] = [
  {
    id: "device.battery", name: "Battery", domain: "device", atlas: ["web.device.battery", "web.device.battery-status"],
    summary: "Reads your battery level and whether you are plugged in.",
    call: "navigator.getBattery()",
    passive: true,
    reveals: ["Whether you are on a laptop or phone, and whether it is plugged in", "How long you have until it dies", "A short lived identifier when combined with other readings"],
    feeds: ["device.profile", "fingerprint.canvas"],
    metrics: [{ key: "level", label: "battery", unit: "%", digits: 0 }],
    live: batteryLive, sim: batterySim, Instrument: BatteryInstrument,
  },
  {
    id: "device.profile", name: "Hardware profile", domain: "device",
    atlas: ["web.device.hardware-concurrency", "web.device.device-memory", "web.device.user-agent", "web.device.ua-client-hints-high", "web.device.ua-client-hints-low", "web.device.touch-support", "web.display.screen-size", "web.display.color-depth", "web.display.device-pixel-ratio"],
    summary: "Lists your CPU threads, memory, screen, platform and browser without asking.",
    call: "navigator.hardwareConcurrency; navigator.userAgentData.getHighEntropyValues([...])",
    passive: true,
    reveals: ["Roughly what price band and age your device is", "Whether you use a phone, tablet, laptop or desktop", "Operating system version and chip type"],
    feeds: ["fingerprint.canvas", "fingerprint.fonts", "device.screens"],
    metrics: [{ key: "cores", label: "threads", digits: 0 }, { key: "memory", label: "memory", unit: "GB", digits: 0 }, { key: "bits", label: "identifying", unit: "bits", digits: 1 }],
    live: profLive, sim: profSim, Instrument: ProfileInstrument,
  },
  {
    id: "device.storage", name: "Storage", domain: "device", atlas: ["web.device.storage-estimate", "web.storage.storage-quota", "web.storage.persistent-storage"],
    summary: "Shows how much disk this site may use and how much it already has.",
    call: "navigator.storage.estimate()",
    passive: true,
    reveals: ["The size of your drive, since quota is a share of free space", "How much this site has stored, and whether you visited before", "Whether you are in a private window"],
    feeds: ["device.profile"],
    metrics: [{ key: "pct", label: "used", unit: "%", digits: 2 }],
    live: storageLive, sim: storageSim, Instrument: StorageInstrument,
  },
  {
    id: "device.pressure", name: "CPU pressure", domain: "device", atlas: ["web.compute.compute-pressure"],
    summary: "Watches how busy your processor is, from calm to critical.",
    call: 'new PressureObserver(cb).observe("cpu")',
    passive: true,
    reveals: ["When you start a call, a game or a heavy app", "Whether your device is plugged in and cooling well", "A side channel for timing attacks"],
    feeds: ["device.battery", "capture.camera"],
    metrics: [{ key: "level", label: "level", digits: 0 }, { key: "load", label: "load", digits: 2 }],
    live: pressureLive, sim: pressureSim, Instrument: PressureInstrument,
  },
  {
    id: "device.screens", name: "All screens", domain: "device", atlas: ["web.display.window-management", "web.display.window-position-multimonitor"],
    summary: "Lists every monitor and how they are laid out.",
    call: "await window.getScreenDetails()",
    permission: "window-management", gesture: true,
    reveals: ["How many monitors you have and their exact sizes", "Which is your laptop screen and which are external", "Where you sit and work: a desk setup is a strong identifier"],
    feeds: ["capture.screen", "device.profile"],
    metrics: [{ key: "count", label: "screens", digits: 0 }],
    live: screensLive, sim: screensSim, Instrument: ScreensInstrument,
  },
];
