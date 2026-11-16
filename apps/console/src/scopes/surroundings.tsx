import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./surroundings.css";
import type { Ctx, InstrumentProps, ScopeDef } from "../core/types";
import { every, noise, series, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Readout, Spark, Table, Waiting, fmt, lastData } from "../ui/kit";

// What is near you: Bluetooth radar plus chooser-based peripherals (USB, serial, HID) and media devices.
// This file is the reference shape for every scope file: adapters (live + sim) and an Instrument.

const nav = () => navigator as any;
const COLOR = DOMAIN_COLOR.surroundings;

// ---------- Bluetooth ----------

type Ble = { id: string; name: string; rssi: number | null; tx: number; dist: number | null; kind: string; services: string[]; seen: number; battery?: number | null };
type BleRec = { devices: Ble[]; count: number; nearest_m: number | null; strongest_dbm: number | null; mode: string };

/** Log-distance path loss: distance in metres from received power and 1 m reference power. */
export function rssiToMetres(rssi: number, tx = -59, n = 2.2) {
  return Math.pow(10, (tx - rssi) / (10 * n));
}

function summarize(list: Ble[], mode: string): BleRec {
  const withD = list.filter((d) => d.dist !== null);
  return {
    devices: list,
    count: list.length,
    nearest_m: withD.length ? Math.min(...withD.map((d) => d.dist as number)) : null,
    strongest_dbm: list.some((d) => d.rssi !== null) ? Math.max(...list.filter((d) => d.rssi !== null).map((d) => d.rssi as number)) : null,
    mode,
  };
}

async function bleLive(ctx: Ctx) {
  const bt = nav().bluetooth;
  if (!bt) unsupported("Web Bluetooth");
  const found = new Map<string, Ble>();
  const push = (mode: string) => ctx.emit(summarize([...found.values()].sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200)), mode));
  const onAdv = (e: any) => {
    const id = e.device.id;
    const prev = found.get(id);
    const tx = typeof e.txPower === "number" ? e.txPower - 41 : -59;
    const rssi = typeof e.rssi === "number" ? e.rssi : null;
    const smooth = prev && prev.rssi !== null && rssi !== null ? prev.rssi * 0.6 + rssi * 0.4 : rssi;
    found.set(id, {
      id, name: e.device.name || e.name || "Unnamed device", rssi: smooth, tx,
      dist: smooth !== null ? rssiToMetres(smooth, tx) : null, kind: e.appearance ? `appearance ${e.appearance}` : "advertiser",
      services: (e.uuids || []).slice(0, 4), seen: Date.now(), battery: prev?.battery ?? null,
    });
    push("scan");
  };

  // Full scan exists only behind a Chrome flag. Try it first, then fall back to one chosen device.
  if (ctx.params.scan && bt.requestLEScan) {
    const scan = await bt.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true });
    ctx.granted();
    ctx.log("LE scan running: every advertiser nearby is visible");
    bt.addEventListener("advertisementreceived", onAdv);
    const tick = every(1000, () => push("scan"));
    return () => { tick(); bt.removeEventListener("advertisementreceived", onAdv); scan.stop(); };
  }

  const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: ["battery_service", "device_information"] });
  ctx.granted();
  ctx.log(`you picked "${device.name || "Unnamed device"}"; the page sees only this device`);
  found.set(device.id, { id: device.id, name: device.name || "Unnamed device", rssi: null, tx: -59, dist: null, kind: "chosen", services: [], seen: Date.now(), battery: null });
  push("chosen");
  let stopAdv: (() => void) | null = null;
  if (device.watchAdvertisements) {
    try {
      const ac = new AbortController();
      device.addEventListener("advertisementreceived", onAdv);
      await device.watchAdvertisements({ signal: ac.signal });
      ctx.log("watching this device's signal strength");
      stopAdv = () => { ac.abort(); device.removeEventListener("advertisementreceived", onAdv); };
    } catch (e: any) {
      ctx.log(`signal strength unavailable: ${e?.message || e}`);
    }
  }
  if (ctx.params.gatt && device.gatt) {
    try {
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService("battery_service");
      const ch = await svc.getCharacteristic("battery_level");
      const v = await ch.readValue();
      const d = found.get(device.id)!;
      d.battery = v.getUint8(0);
      ctx.log(`read battery level ${d.battery}% over GATT`);
      push("chosen");
    } catch (e: any) {
      ctx.log(`GATT read skipped: ${e?.message || e}`);
    }
  }
  const tick = every(1500, () => push(stopAdv ? "watch" : "chosen"));
  return () => { tick(); stopAdv?.(); try { device.gatt?.connected && device.gatt.disconnect(); } catch { /* ignore */ } };
}

const SIM_BLE = [
  ["AirPods Pro", "audio", -52], ["Galaxy Watch6", "wearable", -64], ["Tile Mate", "tracker", -78], ["JBL Flip 6", "speaker", -70],
  ["Unknown, Apple 0x004C", "phone", -60], ["Model 3", "vehicle", -88], ["Fitbit Charge 6", "wearable", -74], ["Bose QC45", "audio", -82],
  ["Nest Hub", "home", -69], ["Unknown, Microsoft 0x0006", "laptop", -80], ["Logitech MX Keys", "keyboard", -58],
] as const;

function bleSim(ctx: Ctx) {
  ctx.granted();
  const list: Ble[] = SIM_BLE.map(([name, kind, base], i) => ({ id: "sim" + i, name, kind, rssi: base, tx: -59, dist: null, services: [], seen: Date.now(), battery: kind === "audio" || kind === "wearable" ? 40 + ((i * 17) % 55) : null }));
  const base = SIM_BLE.map((d) => d[2] as number);
  return every(450, () => {
    list.forEach((d, i) => {
      const drift = Math.sin(Date.now() / (4000 + i * 900) + i) * 6;
      d.rssi = Math.round(base[i] + drift + noise(2.5));
      d.dist = rssiToMetres(d.rssi, d.tx);
      d.seen = Date.now();
    });
    ctx.emit(summarize([...list].sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200)), "scan"));
  });
}

/** Angle is not measurable over Bluetooth; place blips at a stable angle per device id. */
function angleOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return ((h % 3600) / 3600) * Math.PI * 2;
}

const RINGS = [0.5, 1, 2, 5, 10, 20];
const radiusOf = (m: number) => Math.min(1, Math.log10(1 + m * 2) / Math.log10(1 + 40)) * 46;

function Radar({ session }: InstrumentProps) {
  const [pick, setPick] = useState<string | null>(null);
  const d = lastData<BleRec>(session);
  const devices = d?.devices || [];
  const sel = devices.find((x) => x.id === pick) || devices[0];
  const streaming = session.state === "streaming";
  return (
    <Frame
      visual={
        <div className="radar-wrap">
          <svg viewBox="-50 -50 100 100" className="radar">
            <defs>
              <radialGradient id="sweep" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(46)">
                <stop offset="0" stopColor={COLOR} stopOpacity="0.18" />
                <stop offset="1" stopColor={COLOR} stopOpacity="0" />
              </radialGradient>
            </defs>
            {RINGS.map((m) => (
              <g key={m}>
                <circle r={radiusOf(m)} fill="none" stroke={C.line} strokeWidth="0.25" />
                <text x={radiusOf(m) * 0.71 + 0.8} y={-radiusOf(m) * 0.71} className="radar-rt">{m} m</text>
              </g>
            ))}
            <line x1="-46" x2="46" y1="0" y2="0" stroke={C.line2} strokeWidth="0.25" />
            <line y1="-46" y2="46" x1="0" x2="0" stroke={C.line2} strokeWidth="0.25" />
            {streaming && <path className="radar-sweep" d="M0 0 L46 0 A46 46 0 0 0 39.8 -23 Z" fill="url(#sweep)" />}
            {devices.map((x) => {
              if (x.dist === null) return null;
              const a = angleOf(x.id);
              const r = radiusOf(x.dist);
              const on = sel && x.id === sel.id;
              return (
                <g key={x.id} transform={`translate(${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)})`} onClick={() => setPick(x.id)} className="blip">
                  <circle r={on ? 3.2 : 2.2} fill={COLOR} opacity="0.14" />
                  <circle r={on ? 1.5 : 1.1} fill={on ? C.ink : COLOR} />
                  <text y="-2.8" textAnchor="middle" className="blip-label">{x.name.length > 16 ? x.name.slice(0, 15) + "…" : x.name}</text>
                </g>
              );
            })}
            <g className="radar-self">
              <rect x="-3.2" y="-2.2" width="6.4" height="4.4" rx="0.6" fill="#fff" stroke={C.ink} strokeWidth="0.5" />
              <line x1="-4" x2="4" y1="2.6" y2="2.6" stroke={C.ink} strokeWidth="0.5" />
            </g>
          </svg>
          {!d && <Waiting session={session} what="A radar of nearby Bluetooth devices with distance worked out from signal strength." />}
          {d && d.mode === "chosen" && <div className="viz-note">Browsers show only the device you pick. A full radar needs Chrome with experimental scanning on, or Simulated.</div>}
          {d && <div className="viz-caption">Distance comes from signal strength (log-distance model, 1 m reference {sel?.tx ?? -59} dBm). Direction is not measurable, so angles are fixed per device.</div>}
        </div>
      }
      side={
        <>
          <Readout rows={[
            { k: "Devices in range", v: d?.count ?? null, hot: true },
            { k: "Nearest", v: d?.nearest_m ?? null, u: "m", digits: 1 },
            { k: "Strongest signal", v: d?.strongest_dbm ?? null, u: "dBm", digits: 0 },
            { k: "Mode", v: d ? (d.mode === "scan" ? "scan all" : d.mode === "watch" ? "one device, live signal" : "one chosen device") : null },
          ]} />
          {sel && (
            <div className="card">
              <div className="card-h"><b>{sel.name}</b><span>{sel.kind}</span></div>
              <Spark values={series(session.records, "strongest_dbm", 80)} w={220} h={26} color={COLOR} />
              <Readout rows={[
                { k: "Signal", v: sel.rssi, u: "dBm", digits: 0 },
                { k: "Distance", v: sel.dist, u: "m", digits: 2 },
                { k: "Battery", v: sel.battery ?? null, u: "%" },
                { k: "Id", v: sel.id.slice(0, 12) },
              ]} />
            </div>
          )}
          <Table head={["Device", "dBm", "m"]} rows={devices.slice(0, 14).map((x) => [<button className="lnk" onClick={() => setPick(x.id)}>{x.name}</button>, fmt(x.rssi, 0), fmt(x.dist, 1)])} empty="No devices yet" />
        </>
      }
    />
  );
}

// ---------- Chooser peripherals (USB, serial, HID) ----------

type Periph = { name: string; vendor: string; product: string; detail: string };
type PeriphRec = { devices: Periph[]; count: number };
type Kind = "usb" | "serial" | "hid";
const hex = (n: number | undefined) => (typeof n === "number" ? "0x" + n.toString(16).padStart(4, "0") : "n/a");

/** Picked device objects (USBDevice, HIDDevice, SerialPort) by scope id, so the Instrument can act on them after live() returns. */
const held = new Map<string, any[]>();
/** Close callbacks for anything the Instrument opened, run when the session stops. */
const closers = new Map<string, Set<() => void>>();
const keep = (id: string, list: any[]) => { held.set(id, list); };
function onStop(id: string, fn: () => void) {
  let set = closers.get(id);
  if (!set) closers.set(id, (set = new Set()));
  set.add(fn);
  return () => { set!.delete(fn); };
}
function releaseAll(id: string) {
  closers.get(id)?.forEach((f) => { try { f(); } catch { /* ignore */ } });
  closers.delete(id);
  held.delete(id);
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
const toText = (b: Uint8Array) => new TextDecoder().decode(b).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ".");
/** Parse "0a ff 0x10, 7" into bytes. Returns null when anything is not a byte. */
function parseHex(s: string): Uint8Array | null {
  const parts = s.split(/[\s,]+/).filter(Boolean).map((p) => p.replace(/^0x/i, ""));
  if (!parts.every((p) => /^[0-9a-f]{1,2}$/i.test(p))) return null;
  return Uint8Array.from(parts.map((p) => parseInt(p, 16)));
}
const why = (e: any) => (e && (e.message || e.name)) || String(e);
const rel = (t0: number, t: number) => ((t - t0) / 1000).toFixed(2).padStart(7, " ") + "s";

/** Append-only list capped at max entries. */
function useFeed<T>(max = 300) {
  const [items, setItems] = useState<T[]>([]);
  const add = useCallback((...x: T[]) => setItems((p) => { const n = p.concat(x); return n.length > max ? n.slice(n.length - max) : n; }), [max]);
  const clear = useCallback(() => setItems([]), []);
  return { items, add, clear };
}

/** Scrolling box that follows the newest row unless the reader scrolled up. */
function Feed({ n, empty, children }: { n: number; empty: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => { const el = ref.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [n]);
  return (
    <div className="sx-feed" ref={ref} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>
      {n ? children : <div className="sx-empty">{empty}</div>}
    </div>
  );
}

/** Registers a close callback with the session while open, and closes on unmount. */
function useClosing(scopeId: string, open: boolean, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => (open ? onStop(scopeId, () => ref.current()) : undefined), [scopeId, open]);
  useEffect(() => () => ref.current(), []);
}

type PanelProps = { scopeId: string; idx: number; sim: boolean };

// ----- Serial -----

type SerLine = { dir: "rx" | "tx"; t: number; bytes: Uint8Array };
const SIM_LINES = ["temp=23.4 C hum=41%", "adc0=512 adc1=388", "status ok uptime=", "ping", "lux=312"];

function SerialPanel({ scopeId, idx, sim }: PanelProps) {
  const [baud, setBaud] = useState("115200");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"text" | "hex">("text");
  const [ending, setEnding] = useState("\\n");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [rx, setRx] = useState(0);
  const [tx, setTx] = useState(0);
  const feed = useFeed<SerLine>(400);
  const t0 = useRef(Date.now());
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const loopRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<any>(null);
  const openRef = useRef(false);
  const stopping = useRef(false);

  const onRx = (b: Uint8Array) => { setRx((n) => n + b.length); feed.add({ dir: "rx", t: Date.now(), bytes: b }); };

  const connect = async () => {
    setErr("");
    t0.current = Date.now();
    if (sim) {
      let i = 0;
      timerRef.current = setInterval(() => { onRx(new TextEncoder().encode(SIM_LINES[i % SIM_LINES.length] + (i % SIM_LINES.length === 2 ? String(i * 7) : "") + "\r\n")); i++; }, 650);
      openRef.current = true; setOpen(true);
      return;
    }
    try {
      const port = held.get(scopeId)?.[idx];
      if (!port) throw new Error("The port handle is gone. Press Request again.");
      await port.open({ baudRate: Number(baud) });
      portRef.current = port;
      stopping.current = false;
      openRef.current = true; setOpen(true);
      loopRef.current = (async () => {
        while (port.readable && !stopping.current) {
          const reader = port.readable.getReader();
          readerRef.current = reader;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value && value.length) onRx(value);
            }
          } catch (e) {
            if (!stopping.current) setErr(why(e));
            break;
          } finally {
            reader.releaseLock();
            readerRef.current = null;
          }
        }
      })();
    } catch (e) { setErr(why(e)); }
  };

  const disconnect = async () => {
    if (!openRef.current) return;
    openRef.current = false;
    stopping.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try {
      if (readerRef.current) await readerRef.current.cancel().catch(() => {});
      if (loopRef.current) await loopRef.current;
      if (portRef.current) await portRef.current.close();
    } catch (e) { setErr(why(e)); }
    portRef.current = null;
    setOpen(false);
  };
  useClosing(scopeId, open, () => void disconnect());

  const send = async () => {
    const tail = ending === "\\n" ? "\n" : ending === "\\r\\n" ? "\r\n" : "";
    const bytes = new TextEncoder().encode(text + tail);
    if (!bytes.length) return;
    setErr("");
    try {
      if (sim) {
        setTimeout(() => onRx(new TextEncoder().encode("echo: " + text + "\r\n")), 180);
      } else {
        const w = portRef.current.writable.getWriter();
        try { await w.write(bytes); } finally { w.releaseLock(); }
      }
      setTx((n) => n + bytes.length);
      feed.add({ dir: "tx", t: Date.now(), bytes });
      setText("");
    } catch (e) { setErr(why(e)); }
  };

  return (
    <div className="sx-panel">
      <div className="sx-bar">
        <label>Baud
          <select value={baud} disabled={open} onChange={(e) => setBaud(e.target.value)}>
            <option>9600</option><option>115200</option>
          </select>
        </label>
        {open
          ? <button className="btn sm" onClick={() => void disconnect()}>Disconnect</button>
          : <button className="btn sm pri" onClick={() => void connect()}>Connect</button>}
        <div className="sx-seg" role="group" aria-label="Display">
          <button className={mode === "text" ? "on" : ""} onClick={() => setMode("text")}>Text</button>
          <button className={mode === "hex" ? "on" : ""} onClick={() => setMode("hex")}>Hex</button>
        </div>
        <button className="btn sm ghost" onClick={() => { feed.clear(); setRx(0); setTx(0); }}>Clear</button>
        <span className={"sx-badge" + (open ? " live" : "")}>{open ? (sim ? "simulated" : "open") : "closed"}</span>
        <span className="sx-count">{rx} B in, {tx} B out</span>
      </div>
      <Feed n={feed.items.length} empty={open ? "Waiting for bytes from the device." : "Connect to read and write bytes."}>
        {feed.items.map((l, i) => (
          <div key={i} className={"sx-row " + l.dir}>
            <span className="sx-t">{rel(t0.current, l.t)}</span>
            <span className="sx-dir">{l.dir === "rx" ? "RX" : "TX"}</span>
            <span className="sx-val">{mode === "hex" ? toHex(l.bytes) : toText(l.bytes)}</span>
          </div>
        ))}
      </Feed>
      <form className="sx-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={text} disabled={!open} placeholder={open ? "Text to send" : "Connect first"} onChange={(e) => setText(e.target.value)} aria-label="Text to send" />
        <select value={ending} disabled={!open} onChange={(e) => setEnding(e.target.value)} aria-label="Line ending">
          <option value="">no ending</option><option value="\n">LF</option><option value="\r\n">CRLF</option>
        </select>
        <button className="btn sm pri" type="submit" disabled={!open || !text}>Send</button>
      </form>
      {err && <div className="sx-err">{err}</div>}
    </div>
  );
}

// ----- HID -----

type HidRow = { dir: "in" | "out"; t: number; id: number; bytes: Uint8Array };

function HidPanel({ scopeId, idx, sim }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(0);
  const [total, setTotal] = useState(0);
  const [rid, setRid] = useState("0");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const feed = useFeed<HidRow>(250);
  const t0 = useRef(Date.now());
  const devRef = useRef<any>(null);
  const handler = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const rateRef = useRef<any>(null);
  const count = useRef(0);
  const openRef = useRef(false);

  const onIn = (id: number, bytes: Uint8Array) => { count.current++; setTotal((n) => n + 1); feed.add({ dir: "in", t: Date.now(), id, bytes }); };

  const start = async () => {
    setErr("");
    t0.current = Date.now();
    count.current = 0;
    try {
      if (sim) {
        let n = 0;
        timerRef.current = setInterval(() => {
          n++;
          const b = new Uint8Array(8);
          b[0] = n % 20 < 3 ? 1 << (n % 4) : 0;
          b[2] = (128 + Math.round(Math.sin(n / 6) * 90)) & 255;
          b[3] = (128 + Math.round(Math.cos(n / 9) * 90)) & 255;
          b[7] = n & 255;
          onIn(1, b);
        }, 120);
      } else {
        const dev = held.get(scopeId)?.[idx];
        if (!dev) throw new Error("The device handle is gone. Press Request again.");
        if (!dev.opened) await dev.open();
        const h = (e: any) => onIn(e.reportId, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice());
        dev.addEventListener("inputreport", h);
        devRef.current = dev; handler.current = h;
      }
      rateRef.current = setInterval(() => { setRate(count.current); count.current = 0; }, 1000);
      openRef.current = true; setOpen(true);
    } catch (e) { setErr(why(e)); }
  };

  const stop = async () => {
    if (!openRef.current) return;
    openRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rateRef.current) { clearInterval(rateRef.current); rateRef.current = null; }
    try {
      if (devRef.current) {
        devRef.current.removeEventListener("inputreport", handler.current);
        await devRef.current.close();
      }
    } catch (e) { setErr(why(e)); }
    devRef.current = null;
    setRate(0);
    setOpen(false);
  };
  useClosing(scopeId, open, () => void stop());

  const send = async () => {
    setErr("");
    const id = Number(rid);
    const bytes = parseHex(body);
    if (!Number.isInteger(id) || id < 0 || id > 255) return setErr("Report id must be a whole number from 0 to 255.");
    if (!bytes) return setErr("Bytes must be hex pairs such as 01 ff 10.");
    try {
      if (!sim) await devRef.current.sendReport(id, bytes);
      feed.add({ dir: "out", t: Date.now(), id, bytes });
    } catch (e) { setErr(why(e)); }
  };

  return (
    <div className="sx-panel">
      <div className="sx-bar">
        {open
          ? <button className="btn sm" onClick={() => void stop()}>Close</button>
          : <button className="btn sm pri" onClick={() => void start()}>Open</button>}
        <button className="btn sm ghost" onClick={() => { feed.clear(); setTotal(0); }}>Clear</button>
        <span className={"sx-badge" + (open ? " live" : "")}>{open ? (sim ? "simulated" : "open") : "closed"}</span>
        <span className="sx-count"><b>{rate}</b> reports/s, {total} total</span>
      </div>
      <Feed n={feed.items.length} empty={open ? "Waiting for input reports. Press a key or move the device." : "Open the device to stream its input reports."}>
        {feed.items.map((r, i) => (
          <div key={i} className={"sx-row " + (r.dir === "in" ? "rx" : "tx")}>
            <span className="sx-t">{rel(t0.current, r.t)}</span>
            <span className="sx-dir">{r.dir === "in" ? "IN" : "OUT"}</span>
            <span className="sx-id">id {r.id}</span>
            <span className="sx-val">{toHex(r.bytes)}</span>
          </div>
        ))}
      </Feed>
      <form className="sx-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input className="sx-id-in" value={rid} disabled={!open} inputMode="numeric" onChange={(e) => setRid(e.target.value)} aria-label="Report id" />
        <input value={body} disabled={!open} placeholder={open ? "Hex bytes, for example 01 ff 10" : "Open first"} onChange={(e) => setBody(e.target.value)} aria-label="Report bytes in hex" />
        <button className="btn sm pri" type="submit" disabled={!open}>Send report</button>
      </form>
      {err && <div className="sx-err">{err}</div>}
    </div>
  );
}

// ----- USB -----

type UsbEp = { n: number; dir: string; type: string; size: number };
type UsbAlt = { alt: number; cls: string; sub: number; proto: number; name: string; eps: UsbEp[] };
type UsbIf = { num: number; claimed: boolean; alts: UsbAlt[] };
type UsbCfg = { value: number; name: string; active: boolean; ifs: UsbIf[] };

const USB_CLASS: Record<number, string> = { 0: "per interface", 1: "Audio", 2: "Communications", 3: "HID", 5: "Physical", 6: "Image", 7: "Printer", 8: "Mass storage", 9: "Hub", 10: "CDC data", 11: "Smart card", 14: "Video", 224: "Wireless", 239: "Miscellaneous", 254: "Application specific", 255: "Vendor specific" };

function usbTree(dev: any): UsbCfg[] {
  const active = dev.configuration?.configurationValue;
  return (dev.configurations || []).map((c: any) => ({
    value: c.configurationValue, name: c.configurationName || "", active: c.configurationValue === active,
    ifs: (c.interfaces || []).map((i: any) => ({
      num: i.interfaceNumber, claimed: !!i.claimed,
      alts: (i.alternates || []).map((a: any) => ({
        alt: a.alternateSetting, cls: USB_CLASS[a.interfaceClass] || hex(a.interfaceClass), sub: a.interfaceSubclass, proto: a.interfaceProtocol, name: a.interfaceName || "",
        eps: (a.endpoints || []).map((e: any) => ({ n: e.endpointNumber, dir: e.direction, type: e.type, size: e.packetSize })),
      })),
    })),
  }));
}

const SIM_USB: UsbCfg[] = [{
  value: 1, name: "", active: true,
  ifs: [
    { num: 0, claimed: false, alts: [{ alt: 0, cls: "Communications", sub: 2, proto: 1, name: "CDC control", eps: [{ n: 2, dir: "in", type: "interrupt", size: 8 }] }] },
    { num: 1, claimed: false, alts: [{ alt: 0, cls: "CDC data", sub: 0, proto: 0, name: "CDC data", eps: [{ n: 4, dir: "out", type: "bulk", size: 64 }, { n: 5, dir: "in", type: "bulk", size: 64 }] }] },
    { num: 2, claimed: false, alts: [{ alt: 0, cls: "HID", sub: 1, proto: 1, name: "Keyboard", eps: [{ n: 1, dir: "in", type: "interrupt", size: 8 }] }] },
  ],
}];

function UsbPanel({ scopeId, idx, sim }: PanelProps) {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<UsbCfg[]>([]);
  const [err, setErr] = useState("");
  const devRef = useRef<any>(null);
  const openRef = useRef(false);

  const start = async () => {
    setErr("");
    try {
      if (sim) setTree(SIM_USB);
      else {
        const dev = held.get(scopeId)?.[idx];
        if (!dev) throw new Error("The device handle is gone. Press Request again.");
        if (!dev.opened) await dev.open();
        devRef.current = dev;
        setTree(usbTree(dev));
      }
      openRef.current = true; setOpen(true);
    } catch (e) { setErr(why(e)); }
  };
  const stop = async () => {
    if (!openRef.current) return;
    openRef.current = false;
    try { if (devRef.current) await devRef.current.close(); } catch (e) { setErr(why(e)); }
    devRef.current = null;
    setTree([]);
    setOpen(false);
  };
  useClosing(scopeId, open, () => void stop());

  return (
    <div className="sx-panel">
      <div className="sx-bar">
        {open
          ? <button className="btn sm" onClick={() => void stop()}>Close</button>
          : <button className="btn sm pri" onClick={() => void start()}>Open</button>}
        <span className={"sx-badge" + (open ? " live" : "")}>{open ? (sim ? "simulated" : "open") : "closed"}</span>
        <span className="sx-count">Read only. No data is transferred.</span>
      </div>
      <div className="sx-tree">
        {!open && <div className="sx-empty">Open the device to list its configurations, interfaces and endpoints.</div>}
        {open && !tree.length && <div className="sx-empty">This device reports no configurations.</div>}
        {tree.map((c) => (
          <details key={c.value} open className="sx-node">
            <summary>Configuration {c.value}{c.name ? ` (${c.name})` : ""}{c.active && <span className="sx-badge live">active</span>}</summary>
            {c.ifs.map((f) => (
              <details key={f.num} open className="sx-node">
                <summary>Interface {f.num}{f.alts[0] ? <span className="sx-sub"> {f.alts[0].cls}{f.alts[0].name ? `, ${f.alts[0].name}` : ""}</span> : null}</summary>
                {f.alts.map((a) => (
                  <div key={a.alt} className="sx-alt">
                    <div className="sx-altname">Alternate {a.alt} <span className="sx-sub">class {a.cls}, subclass {a.sub}, protocol {a.proto}</span></div>
                    {a.eps.length ? a.eps.map((e) => (
                      <div key={e.dir + e.n} className="sx-ep"><b>EP {e.n}</b><span className={"sx-dirtag " + e.dir}>{e.dir.toUpperCase()}</span><span>{e.type}</span><span>{e.size} B packets</span></div>
                    )) : <div className="sx-sub">No endpoints</div>}
                  </div>
                ))}
              </details>
            ))}
          </details>
        ))}
      </div>
      {err && <div className="sx-err">{err}</div>}
    </div>
  );
}

const PANELS: Record<Kind, (p: PanelProps) => ReactNode> = { usb: UsbPanel, serial: SerialPanel, hid: HidPanel };

function chooserScope(o: { id: string; kind: Kind; name: string; atlas: string; api: string; call: string; permission?: string; summary: string; reveals: string[]; pick: () => Promise<Periph[]>; sim: Periph[] }): ScopeDef {
  const Panel = PANELS[o.kind] as (p: PanelProps) => ReactNode;
  return {
    id: o.id, name: o.name, domain: "surroundings", atlas: [o.atlas], summary: o.summary, call: o.call, permission: o.permission, gesture: true,
    reveals: o.reveals,
    metrics: [{ key: "count", label: "devices" }],
    live: async (ctx) => {
      if (!(o.api in navigator)) unsupported(o.name);
      const devices = await o.pick();
      ctx.granted();
      ctx.emit({ devices, count: devices.length });
      return () => releaseAll(o.id);
    },
    sim: (ctx) => {
      ctx.granted();
      let i = 0;
      const stopTick = every(900, () => {
        i = Math.min(o.sim.length, i + 1);
        ctx.emit({ devices: o.sim.slice(0, i), count: i });
      });
      return () => { stopTick(); releaseAll(o.id); };
    },
    Instrument: ({ scope, session }) => {
      const d = lastData<PeriphRec>(session);
      const sim = session.source === "sim";
      return (
        <Frame
          visual={
            <div className="periph">
              {d ? (
                <div className="sx-devs">
                  {d.devices.map((x, i) => (
                    <div key={`${session.startedAt}-${i}`} className="sx-dev">
                      <div className="periph-card">
                        <svg viewBox="0 0 40 24" className="periph-ico"><rect x="2" y="4" width="28" height="16" rx="3" fill="none" stroke={COLOR} /><rect x="30" y="9" width="8" height="6" rx="1" fill={COLOR} opacity="0.3" /></svg>
                        <div className="sx-meta">
                          <b>{x.name}</b>
                          <span>vendor {x.vendor} · product {x.product}</span>
                          <em>{x.detail}</em>
                        </div>
                      </div>
                      {sim || held.get(scope.id)?.[i]
                        ? <Panel scopeId={scope.id} idx={i} sim={sim} />
                        : <div className="sx-empty">The page let go of this device when the session ended. Press Request to pick it again.</div>}
                    </div>
                  ))}
                </div>
              ) : <Waiting session={session} what="The browser opens a chooser; the page sees only the device you pick, with its vendor and product ids." />}
            </div>
          }
          side={<Readout rows={[{ k: "Devices granted", v: d?.count ?? null, hot: true }, { k: "Sees other devices", v: false }, { k: "Remembered", v: "until you revoke it" }]} />}
        />
      );
    },
  };
}


// ---------- Media devices ----------

type MediaRec = { devices: { kind: string; label: string; id: string }[]; cams: number; mics: number; outs: number; labelled: boolean };

const mediaDevices: ScopeDef = {
  id: "surroundings.media_devices",
  name: "Cameras, mics and speakers",
  domain: "surroundings",
  atlas: ["web.camera.enumerate-devices", "web.peripherals.enumerate-devices"],
  summary: "Counts the cameras, microphones and speakers attached, with names once camera or mic access is granted.",
  call: "navigator.mediaDevices.enumerateDevices()",
  passive: true,
  reveals: ["Whether a headset, dock or external webcam is plugged in", "Stable device ids that help re-identify you on this site"],
  feeds: ["capture.camera", "capture.microphone", "fingerprint.profile"],
  metrics: [{ key: "cams", label: "cams" }, { key: "mics", label: "mics" }],
  live: async (ctx) => {
    if (!navigator.mediaDevices?.enumerateDevices) unsupported("enumerateDevices");
    const read = async () => {
      const list = await navigator.mediaDevices.enumerateDevices();
      const devices = list.map((d) => ({ kind: d.kind, label: d.label || "(name hidden until access)", id: d.deviceId ? d.deviceId.slice(0, 10) : "" }));
      ctx.emit({ devices, cams: list.filter((d) => d.kind === "videoinput").length, mics: list.filter((d) => d.kind === "audioinput").length, outs: list.filter((d) => d.kind === "audiooutput").length, labelled: list.some((d) => !!d.label) });
    };
    ctx.granted();
    await read();
    const on = () => void read();
    navigator.mediaDevices.addEventListener("devicechange", on);
    return () => navigator.mediaDevices.removeEventListener("devicechange", on);
  },
  sim: (ctx) => {
    ctx.granted();
    const devices = [
      { kind: "videoinput", label: "FaceTime HD Camera", id: "a91f03c2be" }, { kind: "videoinput", label: "Logitech BRIO", id: "77c0de1a42" },
      { kind: "audioinput", label: "MacBook Pro Microphone", id: "default" }, { kind: "audioinput", label: "AirPods Pro", id: "3be0a1c9d4" },
      { kind: "audiooutput", label: "MacBook Pro Speakers", id: "default" }, { kind: "audiooutput", label: "AirPods Pro", id: "9d01ce77ab" },
    ];
    ctx.emit({ devices, cams: 2, mics: 2, outs: 2, labelled: true });
    return () => {};
  },
  Instrument: ({ session }) => {
    const d = lastData<MediaRec>(session);
    const groups: [string, string][] = [["videoinput", "Cameras"], ["audioinput", "Microphones"], ["audiooutput", "Speakers"]];
    return (
      <Frame
        visual={d ? (
          <div className="md-cols">
            {groups.map(([k, label]) => (
              <div key={k} className="md-col">
                <h4>{label} <span>{d.devices.filter((x) => x.kind === k).length}</span></h4>
                {d.devices.filter((x) => x.kind === k).map((x, i) => <div key={i} className="md-item"><b>{x.label}</b><code>{x.id || "no id"}</code></div>)}
              </div>
            ))}
          </div>
        ) : <Waiting session={session} what="Lists attached cameras, microphones and speakers. No prompt." />}
        side={<Readout rows={[{ k: "Cameras", v: d?.cams ?? null, hot: true }, { k: "Microphones", v: d?.mics ?? null }, { k: "Speakers", v: d?.outs ?? null }, { k: "Names visible", v: d?.labelled ?? null }]} />}
      />
    );
  },
};

export const surroundingsScopes: ScopeDef[] = [
  {
    id: "surroundings.bluetooth",
    name: "Bluetooth nearby",
    domain: "surroundings",
    atlas: ["web.peripherals.web-bluetooth", "web.notexposed.bluetooth-nearby"],
    summary: "Finds Bluetooth devices around you and estimates how far away each one is from its signal strength.",
    call: "navigator.bluetooth.requestDevice({ acceptAllDevices: true })",
    permission: "bluetooth",
    gesture: true,
    reveals: ["Which headphones, watches and trackers you carry", "Roughly how far each device is, from signal strength", "Whether you are at home (known speakers or hubs in range)"],
    feeds: ["place.geolocation", "fingerprint.profile"],
    metrics: [{ key: "count", label: "devices" }, { key: "nearest_m", label: "nearest", unit: "m", digits: 1 }, { key: "strongest_dbm", label: "peak", unit: "dBm" }],
    params: [
      { key: "scan", label: "Scan everything (Chrome flag)", type: "bool", value: true, hint: "Uses requestLEScan when the experimental flag is on; otherwise falls back to one chosen device." },
      { key: "gatt", label: "Connect and read battery", type: "bool", value: true },
    ],
    live: bleLive,
    sim: bleSim,
    Instrument: Radar,
  },
  mediaDevices,
  chooserScope({
    id: "surroundings.usb", kind: "usb", name: "USB devices", atlas: "web.peripherals.webusb", api: "usb", call: "navigator.usb.requestDevice({ filters: [] })", permission: "usb",
    summary: "Opens a chooser for a USB device and reads its vendor, product and serial details.",
    reveals: ["The make and model of a USB device you pick", "Its serial number, which is unique to that unit"],
    pick: async () => { const d = await nav().usb.requestDevice({ filters: [] }); keep("surroundings.usb", [d]); return [{ name: d.productName || "USB device", vendor: hex(d.vendorId), product: hex(d.productId), detail: `${d.manufacturerName || "unknown maker"} · serial ${d.serialNumber || "hidden"} · USB ${d.usbVersionMajor}.${d.usbVersionMinor}` }]; },
    sim: [{ name: "YubiKey 5C", vendor: "0x1050", product: "0x0407", detail: "Yubico · serial 1734••• · USB 2.0" }, { name: "Arduino Uno", vendor: "0x2341", product: "0x0043", detail: "Arduino LLC · serial 85736••• · USB 1.1" }],
  }),
  chooserScope({
    id: "surroundings.serial", kind: "serial", name: "Serial ports", atlas: "web.peripherals.web-serial", api: "serial", call: "navigator.serial.requestPort()",
    summary: "Opens a chooser for a serial port such as a microcontroller, printer or modem.",
    reveals: ["Hardware hobby kits, label printers or point of sale gear you own"],
    pick: async () => { const p = await nav().serial.requestPort(); keep("surroundings.serial", [p]); const i = p.getInfo ? p.getInfo() : {}; return [{ name: "Serial port", vendor: hex(i.usbVendorId), product: hex(i.usbProductId), detail: i.bluetoothServiceClassId ? "Bluetooth serial" : "USB serial" }]; },
    sim: [{ name: "CP2102 USB to UART", vendor: "0x10c4", product: "0xea60", detail: "USB serial" }],
  }),
  chooserScope({
    id: "surroundings.hid", kind: "hid", name: "HID devices", atlas: "web.peripherals.webhid", api: "hid", call: "navigator.hid.requestDevice({ filters: [] })",
    summary: "Opens a chooser for a keyboard, game pad, pedal or other HID device and reads its report layout.",
    reveals: ["Specialist input gear such as stream decks, flight sticks or medical devices"],
    pick: async () => { const ds = await nav().hid.requestDevice({ filters: [] }); keep("surroundings.hid", ds); return ds.map((d: any) => ({ name: d.productName || "HID device", vendor: hex(d.vendorId), product: hex(d.productId), detail: `${d.collections?.length || 0} report collections` })); },
    sim: [{ name: "Stream Deck MK.2", vendor: "0x0fd9", product: "0x0080", detail: "1 report collection" }],
  }),
];
