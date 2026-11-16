import { useEffect, useState } from "react";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { every, noise, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Readout, Waiting, lastData } from "../ui/kit";
import { askSensor } from "./motion";
import "./place-motion-link.css";

// Where you are: GPS position, time zone and language, compass heading.

const COLOR = DOMAIN_COLOR.place;

const CARDS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const cardinal = (h: number) => CARDS[Math.round((((h % 360) + 360) % 360) / 22.5) % 16];

// ---------- Geolocation ----------

type GeoRec = { lat: number; lon: number; accuracy: number; altitude: number | null; speed: number | null; heading: number | null; fixes: number };

async function geoLive(ctx: Ctx): Promise<Stop> {
  if (!navigator.geolocation) unsupported("Geolocation");
  return new Promise<Stop>((resolve, reject) => {
    let fixes = 0;
    let started = false;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        fixes++;
        if (!started) { started = true; ctx.granted(); resolve(() => navigator.geolocation.clearWatch(id)); }
        const c = p.coords;
        ctx.emit({ lat: c.latitude, lon: c.longitude, accuracy: c.accuracy, altitude: c.altitude, speed: c.speed, heading: c.heading, fixes });
      },
      (e) => {
        if (started) return ctx.log(`fix failed: ${e.message}`);
        navigator.geolocation.clearWatch(id);
        reject(e.code === 1 ? new DOMException("Location permission denied", "NotAllowedError") : new Error(e.message || "Position unavailable"));
      },
      { enableHighAccuracy: !!ctx.params.high, maximumAge: 0, timeout: 20000 },
    );
  });
}

function geoSim(ctx: Ctx): Stop {
  ctx.granted();
  const lat0 = 44.9778, lon0 = -93.265;
  let fixes = 0;
  let prev: [number, number] | null = null;
  return every(1000, () => {
    fixes++;
    const a = fixes / 14;
    const dx = 45 * Math.cos(a) + noise(1.5), dy = 32 * Math.sin(a * 1.3) + noise(1.5);
    const lat = lat0 + dy / 110540, lon = lon0 + dx / (111320 * Math.cos((lat0 * Math.PI) / 180));
    const heading = prev ? ((Math.atan2(dx - prev[0], dy - prev[1]) * 180) / Math.PI + 360) % 360 : null;
    const speed = prev ? Math.hypot(dx - prev[0], dy - prev[1]) : null;
    prev = [dx, dy];
    ctx.emit({ lat, lon, accuracy: 9 + noise(3), altitude: 252 + noise(1.2), speed, heading, fixes });
  });
}

const niceStep = (r: number) => {
  const raw = r / 3, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
};

function GeoMap({ session }: InstrumentProps) {
  const d = lastData<GeoRec>(session);
  const trail = session.records.slice(-80).map((r) => r.data as unknown as GeoRec);
  let body = null;
  if (d) {
    const k = 111320 * Math.cos((d.lat * Math.PI) / 180);
    const pts = trail.map((t) => ({ x: (t.lon - d.lon) * k, y: -(t.lat - d.lat) * 110540 }));
    const R = Math.max(20, d.accuracy, ...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) * 1.25;
    const s = 90 / R;
    const step = niceStep(R);
    const lines: number[] = [];
    for (let v = -Math.floor(R / step) * step; v <= R; v += step) lines.push(v);
    const path = pts.map((p, i) => (i ? "L" : "M") + (p.x * s).toFixed(1) + " " + (p.y * s).toFixed(1)).join(" ");
    body = (
      <svg viewBox="-100 -100 200 200" className="pml-svg">
        <rect x="-100" y="-100" width="200" height="200" fill="#fff" stroke={C.line} strokeWidth="0.4" />
        {lines.map((v) => (
          <g key={v}>
            <line x1={v * s} x2={v * s} y1="-100" y2="100" stroke={C.line} strokeWidth="0.3" />
            <line y1={v * s} y2={v * s} x1="-100" x2="100" stroke={C.line} strokeWidth="0.3" />
          </g>
        ))}
        <line x1="-100" x2="100" y1="0" y2="0" stroke={C.line} strokeWidth="0.6" />
        <line y1="-100" y2="100" x1="0" x2="0" stroke={C.line} strokeWidth="0.6" />
        <path d={path} fill="none" stroke={COLOR} strokeWidth="0.8" opacity="0.5" strokeLinejoin="round" />
        {pts.slice(0, -1).map((p, i) => <circle key={i} cx={p.x * s} cy={p.y * s} r="0.9" fill={COLOR} opacity={0.15 + 0.5 * (i / pts.length)} />)}
        <circle r={Math.max(2, d.accuracy * s)} fill={COLOR} fillOpacity="0.1" stroke={COLOR} strokeWidth="0.5" strokeDasharray="1.5 1.5" />
        {d.heading !== null && <path d="M0 -9 L2.4 -3 L-2.4 -3 Z" fill={C.ink} transform={`rotate(${d.heading})`} />}
        <circle r="2.2" fill={COLOR} stroke="#fff" strokeWidth="0.8" />
        <text x="-97" y="-93">N up · grid {step} m</text>
        <text x="97" y="97" textAnchor="end">accuracy ring {Math.round(d.accuracy)} m</text>
      </svg>
    );
  }
  return (
    <Frame
      visual={
        <div className="pml-vis">
          {body || <Waiting session={session} what="A plain grid map: your position, an accuracy ring in metres, and a trail of recent fixes." />}
          {d && <div className="pml-note">No map tiles are loaded. The ring is how sure the device is; a site gets this precision with one click.</div>}
        </div>
      }
      side={<Readout rows={[
        { k: "Latitude", v: d?.lat ?? null, digits: 5, hot: true },
        { k: "Longitude", v: d?.lon ?? null, digits: 5, hot: true },
        { k: "Accuracy", v: d?.accuracy ?? null, u: "m", digits: 0 },
        { k: "Altitude", v: d?.altitude ?? null, u: "m", digits: 0 },
        { k: "Speed", v: d?.speed ?? null, u: "m/s", digits: 1 },
        { k: "Heading", v: d?.heading ?? null, u: "deg", digits: 0 },
        { k: "Fixes", v: d?.fixes ?? null, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Time zone ----------

type TzRec = { timezone: string; locale: string; languages: string; offset_min: number; offset_h: number; now: number };

function readTz(fake?: { timezone: string; offset_min: number; locale: string; languages: string }): TzRec {
  const offset_min = fake ? fake.offset_min : -new Date().getTimezoneOffset();
  return {
    timezone: fake ? fake.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    locale: fake ? fake.locale : Intl.DateTimeFormat().resolvedOptions().locale,
    languages: fake ? fake.languages : (navigator.languages || [navigator.language]).join(", "),
    offset_min, offset_h: offset_min / 60, now: Date.now(),
  };
}

const tzLive = async (ctx: Ctx): Promise<Stop> => { ctx.granted(); return every(1000, () => ctx.emit({ ...readTz() })); };
const tzSim = (ctx: Ctx): Stop => {
  ctx.granted();
  const fake = { timezone: "Asia/Kolkata", offset_min: 330, locale: "en-IN", languages: "en-IN, hi, en" };
  return every(1000, () => ctx.emit({ ...readTz(fake) }));
};

function Timezone({ session }: InstrumentProps) {
  const d = lastData<TzRec>(session);
  const [, tick] = useState(0);
  useEffect(() => { const h = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(h); }, []);
  const cells = Array.from({ length: 27 }, (_, i) => i - 12);
  let clock = "";
  if (d) {
    const t = new Date(Date.now() + d.offset_min * 60000);
    clock = t.toISOString().slice(11, 19);
  }
  return (
    <Frame
      visual={
        <div className="pml-vis">
          {d ? (
            <>
              <div className="pml-clock">{clock}<small>local, UTC{d.offset_h >= 0 ? "+" : ""}{d.offset_h}</small></div>
              <div className="pml-strip">
                {cells.map((h) => {
                  const on = Math.floor(d.offset_h) === h;
                  return <div key={h} className={on ? "on" : Math.abs(d.offset_h - h) < 1 && d.offset_h % 1 ? "half" : ""}>{h > 0 ? "+" + h : h}</div>;
                })}
              </div>
              <div className="pml-note">The strip is the world in hour offsets from UTC. Your band is lit. Combined with language, it narrows where you live to a region.</div>
            </>
          ) : <Waiting session={session} what="A world strip of UTC offsets with your band lit and a live clock." />}
        </div>
      }
      side={<Readout rows={[
        { k: "Time zone", v: d?.timezone ?? null, hot: true },
        { k: "UTC offset", v: d ? d.offset_h : null, u: "h", digits: 1 },
        { k: "Locale", v: d?.locale ?? null },
        { k: "Languages", v: d?.languages ?? null },
      ]} />}
    />
  );
}

// ---------- Compass ----------

type CompRec = { heading: number; absolute: boolean; source: string };

async function compassLive(ctx: Ctx): Promise<Stop> {
  await askSensor("DeviceOrientationEvent");
  ctx.granted();
  let last = 0;
  let got = false;
  const send = (heading: number, absolute: boolean, source: string) => {
    const now = performance.now();
    if (now - last < 50) return;
    last = now; got = true;
    ctx.emit({ heading: ((heading % 360) + 360) % 360, absolute, source });
  };
  const abs = (e: Event) => { const a = (e as DeviceOrientationEvent).alpha; if (a !== null) send(360 - a, true, "deviceorientationabsolute"); };
  const rel = (e: Event) => {
    const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
    if (typeof o.webkitCompassHeading === "number") send(o.webkitCompassHeading, true, "webkitCompassHeading");
    else if (!("ondeviceorientationabsolute" in window) && o.alpha !== null) send(360 - o.alpha, !!o.absolute, "deviceorientation");
  };
  window.addEventListener("deviceorientationabsolute", abs);
  window.addEventListener("deviceorientation", rel);
  const t = setTimeout(() => !got && ctx.log("no heading arrived: this device has no magnetometer. Try Simulated."), 3000);
  return () => { clearTimeout(t); window.removeEventListener("deviceorientationabsolute", abs); window.removeEventListener("deviceorientation", rel); };
}

function compassSim(ctx: Ctx): Stop {
  ctx.granted();
  return every(50, () => {
    const t = Date.now() / 1000;
    ctx.emit({ heading: (((205 + 40 * Math.sin(t * 0.25) + 12 * Math.sin(t * 0.9) + noise(0.8)) % 360) + 360) % 360, absolute: true, source: "simulated" });
  });
}

function Compass({ session }: InstrumentProps) {
  const d = lastData<CompRec>(session);
  const h = d?.heading ?? 0;
  return (
    <Frame
      visual={
        <div className="pml-vis">
          <svg viewBox="-60 -60 120 120" className="pml-svg" style={{ maxWidth: 300 }}>
            <circle r="52" fill="#fff" stroke={C.line} strokeWidth="0.8" />
            <circle r="40" fill="none" stroke={C.line} strokeWidth="0.4" />
            {Array.from({ length: 72 }, (_, i) => {
              const major = i % 9 === 0, a = (i * 5 * Math.PI) / 180;
              return <line key={i} x1={Math.sin(a) * (major ? 44 : 48)} y1={-Math.cos(a) * (major ? 44 : 48)} x2={Math.sin(a) * 52} y2={-Math.cos(a) * 52} stroke={major ? C.ink2 : C.mute} strokeWidth={major ? 0.7 : 0.3} />;
            })}
            {([["N", 0, -34], ["E", 34, 2], ["S", 0, 38], ["W", -34, 2]] as const).map(([l, x, y]) => <text key={l} x={x} y={y} textAnchor="middle" style={{ fontSize: 7, fill: l === "N" ? C.err : C.ink2, fontWeight: 600 }}>{l}</text>)}
            <g transform={`rotate(${h})`} style={{ transition: "transform 80ms linear" }}>
              <path d="M0 -30 L4 0 L-4 0 Z" fill={C.err} />
              <path d="M0 30 L4 0 L-4 0 Z" fill={C.ink} opacity="0.75" />
            </g>
            <circle r="1.8" fill="#fff" stroke={C.ink} strokeWidth="0.6" />
          </svg>
          {!d && <Waiting session={session} what="A compass needle that follows the magnetic heading of the device." />}
          <div className="pml-note">The needle shows where the top of the device points. Phones read this from a magnetometer, so no GPS is needed.</div>
        </div>
      }
      side={<Readout rows={[
        { k: "Heading", v: d?.heading ?? null, u: "deg", digits: 0, hot: true },
        { k: "Direction", v: d ? cardinal(d.heading) : null },
        { k: "Absolute (true north)", v: d?.absolute ?? null },
        { k: "Source", v: d?.source ?? null },
      ]} />}
    />
  );
}

export const placeScopes: ScopeDef[] = [
  {
    id: "place.geolocation", name: "Geolocation", domain: "place",
    atlas: ["web.location.geolocation"],
    summary: "Follows your position from GPS, Wi-Fi and cell data with an accuracy in metres.",
    call: "navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true })",
    permission: "geolocation", gesture: true,
    reveals: ["Your home, work and daily routes", "Whether you are walking, driving or standing still", "Which venue or store you are inside, at building precision"],
    feeds: ["place.timezone", "surroundings.bluetooth", "motion.accelerometer"],
    metrics: [{ key: "lat", label: "lat", digits: 4 }, { key: "lon", label: "lon", digits: 4 }, { key: "accuracy", label: "accuracy", unit: "m", digits: 0 }, { key: "speed", label: "speed", unit: "m/s", digits: 1 }],
    params: [{ key: "high", label: "High accuracy (GPS)", type: "bool", value: true, hint: "Asks for the most precise fix, which uses more battery." }],
    live: geoLive, sim: geoSim, Instrument: GeoMap,
  },
  {
    id: "place.timezone", name: "Time zone and language", domain: "place",
    atlas: ["web.locale.timezone", "web.locale.language", "web.locale.accept-language"],
    summary: "Reads your time zone, UTC offset, locale and preferred languages. No prompt is shown.",
    call: "Intl.DateTimeFormat().resolvedOptions().timeZone; navigator.languages",
    passive: true,
    reveals: ["The region you live in, without asking for location", "A travel or VPN mismatch when zone and IP disagree", "Your language and likely heritage"],
    feeds: ["place.geolocation", "fingerprint.profile"],
    metrics: [{ key: "offset_h", label: "UTC offset", unit: "h", digits: 1 }],
    live: tzLive, sim: tzSim, Instrument: Timezone,
  },
  {
    id: "place.compass", name: "Compass heading", domain: "place",
    atlas: ["web.location.sensor-magnetometer", "web.location.device-orientation"],
    summary: "Reads which way the device is facing from its magnetometer.",
    call: "window.addEventListener('deviceorientationabsolute', e => 360 - e.alpha)",
    gesture: true,
    reveals: ["Which direction you face, to the degree", "Which way you turn at a corner when joined with GPS", "A magnetometer fingerprint unique to your hardware"],
    feeds: ["place.geolocation", "motion.orientation"],
    metrics: [{ key: "heading", label: "heading", unit: "deg", digits: 0 }],
    live: compassLive, sim: compassSim, Instrument: Compass,
  },
];
