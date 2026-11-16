import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { every, noise, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Est, Frame, Readout, Waiting, lastData } from "../ui/kit";
import { useLook } from "../ui/look";
import { askSensor } from "./motion";
import "./place-motion-link.css";

// Where you are: GPS position, time zone and language, compass heading.

const COLOR = DOMAIN_COLOR.place;

const CARDS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const cardinal = (h: number) => CARDS[Math.round((((h % 360) + 360) % 360) / 22.5) % 16];

// ---------- Inference helpers ----------
// When the device does not report a value, the console estimates it and records the source in
// `inferred` (field name to plain text). The readouts and the map mark every such value "estimated".

type Inferred = Record<string, string>;
const R_EARTH = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

type LL = { lat: number; lon: number };
const distM = (a: LL, b: LL) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
};
const bearing = (a: LL, b: LL) => {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

/** Fills a missing speed or heading from the last two fixes. Returns the inferred map, if any. */
function makeDeriver() {
  let prev: { lat: number; lon: number; t: number } | null = null;
  let lastBearing: number | null = null;
  return (fix: { lat: number; lon: number; speed: number | null; heading: number | null }, t = Date.now()) => {
    const inferred: Inferred = {};
    if (prev) {
      const dt = (t - prev.t) / 1000;
      const d = distM(prev, fix);
      if (dt > 0.2 && fix.speed === null) { fix.speed = d / dt; inferred.speed = "distance between the last two fixes divided by the time between them"; }
      if (d >= 3) lastBearing = bearing(prev, fix);
      if (fix.heading === null && lastBearing !== null) { fix.heading = lastBearing; inferred.heading = "bearing between the last two fixes"; }
    }
    prev = { lat: fix.lat, lon: fix.lon, t };
    return inferred;
  };
}

// Rough city centres for common IANA zones. Used only when the live fix fails and the edge guess is unavailable.
const TZ_CITY: Record<string, [string, number, number]> = {
  "America/New_York": ["New York", 40.71, -74.0], "America/Chicago": ["Chicago", 41.88, -87.63], "America/Denver": ["Denver", 39.74, -104.99],
  "America/Los_Angeles": ["Los Angeles", 34.05, -118.24], "America/Phoenix": ["Phoenix", 33.45, -112.07], "America/Anchorage": ["Anchorage", 61.22, -149.9],
  "Pacific/Honolulu": ["Honolulu", 21.31, -157.86], "America/Toronto": ["Toronto", 43.65, -79.38], "America/Vancouver": ["Vancouver", 49.28, -123.12],
  "America/Mexico_City": ["Mexico City", 19.43, -99.13], "America/Bogota": ["Bogota", 4.71, -74.07], "America/Lima": ["Lima", -12.05, -77.04],
  "America/Sao_Paulo": ["Sao Paulo", -23.55, -46.63], "America/Argentina/Buenos_Aires": ["Buenos Aires", -34.6, -58.38], "America/Santiago": ["Santiago", -33.45, -70.67],
  "Europe/London": ["London", 51.51, -0.13], "Europe/Dublin": ["Dublin", 53.35, -6.26], "Europe/Paris": ["Paris", 48.86, 2.35], "Europe/Berlin": ["Berlin", 52.52, 13.4],
  "Europe/Madrid": ["Madrid", 40.42, -3.7], "Europe/Rome": ["Rome", 41.9, 12.5], "Europe/Amsterdam": ["Amsterdam", 52.37, 4.9], "Europe/Stockholm": ["Stockholm", 59.33, 18.07],
  "Europe/Athens": ["Athens", 37.98, 23.73], "Europe/Istanbul": ["Istanbul", 41.01, 28.98], "Europe/Moscow": ["Moscow", 55.76, 37.62],
  "Africa/Cairo": ["Cairo", 30.04, 31.24], "Africa/Lagos": ["Lagos", 6.52, 3.38], "Africa/Johannesburg": ["Johannesburg", -26.2, 28.05], "Africa/Nairobi": ["Nairobi", -1.29, 36.82],
  "Asia/Dubai": ["Dubai", 25.2, 55.27], "Asia/Karachi": ["Karachi", 24.86, 67.01], "Asia/Kolkata": ["Mumbai", 19.08, 72.88], "Asia/Calcutta": ["Mumbai", 19.08, 72.88],
  "Asia/Dhaka": ["Dhaka", 23.81, 90.41], "Asia/Bangkok": ["Bangkok", 13.76, 100.5], "Asia/Jakarta": ["Jakarta", -6.21, 106.85], "Asia/Singapore": ["Singapore", 1.35, 103.82],
  "Asia/Hong_Kong": ["Hong Kong", 22.32, 114.17], "Asia/Shanghai": ["Shanghai", 31.23, 121.47], "Asia/Manila": ["Manila", 14.6, 120.98], "Asia/Seoul": ["Seoul", 37.57, 126.98],
  "Asia/Tokyo": ["Tokyo", 35.68, 139.69], "Australia/Perth": ["Perth", -31.95, 115.86], "Australia/Sydney": ["Sydney", -33.87, 151.21], "Australia/Melbourne": ["Melbourne", -37.81, 144.96],
  "Pacific/Auckland": ["Auckland", -36.85, 174.76],
};

type Guess = { lat: number; lon: number; place: string; source: string };

async function guessPlace(): Promise<Guess | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("/api/whereami", { cache: "no-store", signal: ctl.signal });
    clearTimeout(t);
    const j = (await r.json()) as { lat?: number; lon?: number; city?: string; country?: string; region?: string };
    if (typeof j.lat === "number" && typeof j.lon === "number") {
      const place = [j.city, j.region, j.country].filter(Boolean).join(", ");
      return { lat: j.lat, lon: j.lon, place: place || "unknown place", source: "your network address, looked up at the host's edge (no third party)" };
    }
  } catch { /* not hosted on Vercel, offline, or blocked */ }
  let zone = "";
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* no Intl */ }
  const c = TZ_CITY[zone];
  if (c) return { lat: c[1], lon: c[2], place: c[0], source: `your time zone (${zone}), placed at a nearby city` };
  return null;
}

// ---------- Geolocation ----------

type GeoRec = {
  lat: number; lon: number; accuracy: number; altitude: number | null; speed: number | null; heading: number | null; fixes: number;
  place?: string; inferred?: Inferred;
};

const ESTIMATE_ACCURACY = 25000;
const finite = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : null);

async function geoLive(ctx: Ctx): Promise<Stop> {
  if (!navigator.geolocation) unsupported("Geolocation");
  return new Promise<Stop>((resolve) => {
    let fixes = 0;
    let real = false;
    let fallbackStarted = false;
    let dead = false;
    let watch = -1;
    const derive = makeDeriver();
    const stop = () => { dead = true; if (watch >= 0) navigator.geolocation.clearWatch(watch); };

    const estimate = async (why: string) => {
      if (fallbackStarted || real) return;
      fallbackStarted = true;
      ctx.log(`live fix unavailable (${why}); estimating from the network address or time zone`);
      const g = await guessPlace();
      if (dead || real) return;
      ctx.granted();
      if (!g) { ctx.log("no estimate possible: no edge location and an unknown time zone"); return resolve(stop); }
      fixes++;
      ctx.emit({
        lat: g.lat, lon: g.lon, accuracy: ESTIMATE_ACCURACY, altitude: null, speed: null, heading: null, fixes, place: g.place,
        inferred: { lat: g.source, lon: g.source, accuracy: "typical error of a city level guess", place: g.source },
      });
      resolve(stop);
    };

    watch = navigator.geolocation.watchPosition(
      (p) => {
        real = true;
        fixes++;
        if (fixes === 1) { ctx.granted(); resolve(stop); }
        const c = p.coords;
        const fix = { lat: c.latitude, lon: c.longitude, speed: finite(c.speed), heading: finite(c.heading) };
        const inferred = derive(fix, p.timestamp || Date.now());
        ctx.emit({ lat: fix.lat, lon: fix.lon, accuracy: c.accuracy, altitude: c.altitude, speed: fix.speed, heading: fix.heading, fixes, ...(Object.keys(inferred).length ? { inferred } : {}) });
      },
      (e) => {
        if (real) return ctx.log(`fix failed: ${e.message}`);
        if (e.code === 1) navigator.geolocation.clearWatch(watch); // denied: this watch will never produce a fix
        void estimate(e.code === 1 ? "permission denied" : e.code === 3 ? "timed out" : e.message || "position unavailable");
      },
      { enableHighAccuracy: !!ctx.params.high, maximumAge: 0, timeout: 20000 },
    );
  });
}

function geoSim(ctx: Ctx): Stop {
  ctx.granted();
  const lat0 = 44.9778, lon0 = -93.265;
  let fixes = 0;
  const derive = makeDeriver();
  return every(1000, () => {
    fixes++;
    const a = fixes / 14;
    const dx = 45 * Math.cos(a) + noise(1.5), dy = 32 * Math.sin(a * 1.3) + noise(1.5);
    const lat = lat0 + dy / 110540, lon = lon0 + dx / (111320 * Math.cos((lat0 * Math.PI) / 180));
    // The simulated device reports no speed or heading, so both are inferred from successive fixes.
    const fix = { lat, lon, speed: null as number | null, heading: null as number | null };
    const inferred = derive(fix);
    ctx.emit({ lat, lon, accuracy: 9 + noise(3), altitude: 252 + noise(1.2), speed: fix.speed, heading: fix.heading, fixes, ...(Object.keys(inferred).length ? { inferred } : {}) });
  });
}

// CARTO raster tiles now answer every request with an "API KEY REQUIRED" watermark, so the basemap is
// OpenStreetMap's own tile server (light) and the same tiles inverted by CSS for the dark looks.
// Set VITE_MAP_TILES to a tile URL template (for example a keyed CARTO or MapTiler URL) to override.
const TILE_URL = (import.meta.env.VITE_MAP_TILES as string | undefined) || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const isEstimate = (d: GeoRec | null) => !!(d && d.inferred && (d.inferred.lat || d.inferred.accuracy));

function GeoMap({ session }: InstrumentProps) {
  const d = lastData<GeoRec>(session);
  const dark = useLook() !== "light";
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ dot: L.CircleMarker; ring: L.Circle; trail: L.Polyline } | null>(null);
  const follow = useRef(true);
  const framedFor = useRef<boolean | null>(null);
  const [following, setFollowing] = useState(true);

  // Create the map once the first fix arrives and the box exists; remove it on unmount.
  const has = !!d;
  useEffect(() => {
    if (!has || !box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, worldCopyJump: true }).setView([0, 0], 2);
    map.current = m;
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIB }).addTo(m);
    layers.current = {
      trail: L.polyline([], { color: COLOR, weight: 3, opacity: 0.7 }).addTo(m),
      ring: L.circle([0, 0], { radius: 1, color: COLOR, weight: 1.5, fillColor: COLOR, fillOpacity: 0.12 }).addTo(m),
      dot: L.circleMarker([0, 0], { radius: 7, color: "#ffffff", weight: 2, fillColor: COLOR, fillOpacity: 1 }).addTo(m),
    };
    m.on("dragstart", () => { follow.current = false; setFollowing(false); });
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; layers.current = null; framedFor.current = null; };
  }, [has]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw the latest fix. The map is created in an effect above, so this runs after it on the same commit.
  const seq = session.last?.seq;
  useEffect(() => {
    const m = map.current, l = layers.current;
    if (!m || !l || !d) return;
    const est = isEstimate(d);
    const pos: L.LatLngTuple = [d.lat, d.lon];
    l.dot.setLatLng(pos);
    l.dot.setStyle({ fillOpacity: est ? 0.55 : 1, dashArray: est ? "3 3" : undefined });
    l.ring.setLatLng(pos).setRadius(Math.max(1, d.accuracy));
    l.ring.setStyle({ dashArray: est ? "6 6" : undefined, fillOpacity: est ? 0.06 : 0.12 });
    const real = session.records.slice(-80).map((r) => r.data as unknown as GeoRec).filter((r) => !isEstimate(r));
    l.trail.setLatLngs(real.map((r) => [r.lat, r.lon] as L.LatLngTuple));
    if (framedFor.current !== est) {
      // First fix, or an estimate was replaced by a real fix: frame the new accuracy circle.
      framedFor.current = est;
      follow.current = true; setFollowing(true);
      m.fitBounds(l.ring.getBounds(), { maxZoom: 17, padding: [24, 24], animate: false });
    } else if (follow.current) {
      m.panTo(pos, { animate: true, duration: 0.6 });
    }
  }, [seq, has]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentre = () => {
    follow.current = true; setFollowing(true);
    if (d && map.current) map.current.panTo([d.lat, d.lon]);
  };

  const inf = (k: string) => d?.inferred?.[k];
  const estimated = isEstimate(d);
  return (
    <Frame
      visual={
        <div className="pml-vis pml-geo">
          {d ? (
            <>
              <div ref={box} className={"pml-map" + (dark ? " pml-map-dark" : "")} />
              <div className="pml-map-bar">
                {estimated
                  ? <span><Est /> {inf("lat") || inf("accuracy")}{d.place ? ` (${d.place})` : ""}. The dashed ring is the likely error.</span>
                  : <span>Dot: your fix. Ring: how sure the device is ({Math.round(d.accuracy)} m).</span>}
                {!following && <button type="button" className="pml-recentre" onClick={recentre}>Follow</button>}
              </div>
            </>
          ) : <Waiting session={session} what="A street map with your position, an accuracy ring in metres, and a trail of recent fixes." />}
        </div>
      }
      side={<Readout rows={[
        { k: "Latitude", v: d?.lat ?? null, digits: 5, hot: true, inferred: inf("lat") },
        { k: "Longitude", v: d?.lon ?? null, digits: 5, hot: true, inferred: inf("lon") },
        ...(d?.place ? [{ k: "Place", v: d.place, inferred: inf("place") }] : []),
        { k: "Accuracy", v: d?.accuracy ?? null, u: "m", digits: 0, inferred: inf("accuracy") },
        { k: "Altitude", v: d?.altitude ?? null, u: "m", digits: 0, inferred: inf("altitude") },
        { k: "Speed", v: d?.speed ?? null, u: "m/s", digits: 1, inferred: inf("speed") },
        { k: "Heading", v: d?.heading ?? null, u: "deg", digits: 0, inferred: inf("heading") },
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

type CompRec = { heading: number; absolute: boolean; source: string; inferred?: Inferred };

async function compassLive(ctx: Ctx): Promise<Stop> {
  await askSensor("DeviceOrientationEvent");
  ctx.granted();
  let last = 0;
  let got = false;
  let watch = -1;
  const send = (heading: number, absolute: boolean, source: string) => {
    const now = performance.now();
    if (now - last < 50) return;
    last = now; got = true;
    if (watch >= 0) { navigator.geolocation.clearWatch(watch); watch = -1; } // a real reading wins over any estimate
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

  // No magnetometer reading in 3 s: estimate the heading from the direction of travel instead.
  const t = setTimeout(() => {
    if (got) return;
    if (!navigator.geolocation) return ctx.log("no heading arrived and there is no GPS to estimate from. Try Simulated.");
    ctx.log("no compass reading in 3 s; estimating the heading from GPS movement (move to get one)");
    let prev: { lat: number; lon: number } | null = null;
    watch = navigator.geolocation.watchPosition(
      (p) => {
        if (got) return;
        const c = p.coords;
        const here = { lat: c.latitude, lon: c.longitude };
        const course = finite(c.heading);
        let hd: number | null = null;
        let src = "";
        if (course !== null && (c.speed === null || c.speed > 0.5)) { hd = course; src = "GPS course of travel"; }
        else if (prev && distM(prev, here) >= 3) { hd = bearing(prev, here); src = "bearing between the last two GPS fixes"; }
        if (!prev || distM(prev, here) >= 3) prev = here;
        if (hd === null) return;
        ctx.emit({ heading: hd, absolute: true, source: "inferred from GPS", inferred: { heading: src, source: src } });
      },
      (e) => ctx.log(`GPS heading unavailable: ${e.message || "no fix"}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, 3000);
  return () => {
    clearTimeout(t);
    if (watch >= 0) navigator.geolocation.clearWatch(watch);
    window.removeEventListener("deviceorientationabsolute", abs);
    window.removeEventListener("deviceorientation", rel);
  };
}

function compassSim(ctx: Ctx): Stop {
  ctx.granted();
  return every(50, () => {
    const t = Date.now() / 1000;
    ctx.emit({ heading: (((205 + 40 * Math.sin(t * 0.25) + 12 * Math.sin(t * 0.9) + noise(0.8)) % 360) + 360) % 360, absolute: true, source: "simulated" });
  });
}

const RING_NUMBERS = [30, 60, 120, 150, 210, 240, 300, 330];

function Compass({ session }: InstrumentProps) {
  const d = lastData<CompRec>(session);
  // Unwrap so the dial always turns the short way (359 to 0 is one degree, not 359).
  const turn = useRef(0);
  if (d) {
    const cur = ((turn.current % 360) + 360) % 360;
    turn.current += ((d.heading - cur + 540) % 360) - 180;
  }
  const est = d?.inferred?.heading;
  return (
    <Frame
      visual={
        <div className="pml-vis">
          <svg viewBox="-60 -62 120 124" className="pml-svg" style={{ maxWidth: 320 }} role="img" aria-label={d ? `Compass heading ${Math.round(d.heading)} degrees ${cardinal(d.heading)}` : "Compass"}>
            <circle r="58" fill={C.panel} stroke={C.line} strokeWidth="0.8" />
            <circle r="56" fill={C.bg} stroke={C.line2} strokeWidth="0.4" />
            {/* The dial turns so the current heading sits under the fixed marker at the top. */}
            <g style={{ transform: `rotate(${-turn.current}deg)`, transition: "transform 140ms linear" }}>
              {Array.from({ length: 72 }, (_, i) => {
                const deg = i * 5, major = deg % 30 === 0, a = rad(deg);
                const r1 = major ? 46 : 50;
                return <line key={i} x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1} x2={Math.sin(a) * 54} y2={-Math.cos(a) * 54} stroke={major ? C.ink2 : C.mute} strokeWidth={major ? 0.8 : 0.35} />;
              })}
              {RING_NUMBERS.map((deg) => (
                <text key={deg} transform={`rotate(${deg}) translate(0 -40)`} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 4.2, fill: C.mute }}>{deg}</text>
              ))}
              {([["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const).map(([l, deg]) => (
                <text key={l} transform={`rotate(${deg}) translate(0 -38)`} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: l === "N" ? 10 : 8, fill: l === "N" ? C.err : C.ink, fontWeight: 700 }}>{l}</text>
              ))}
              {/* North needle: red points to north, grey tail to south. */}
              <path d="M0 -28 L3.6 0 L-3.6 0 Z" fill={C.err} />
              <path d="M0 28 L3.6 0 L-3.6 0 Z" fill={C.mute} opacity="0.7" />
            </g>
            <circle r="2.2" fill={C.bg} stroke={C.ink} strokeWidth="0.7" />
            <path d="M0 -61 L3.2 -55.5 L-3.2 -55.5 Z" fill={C.accent} stroke={C.bg} strokeWidth="0.5" />
          </svg>
          {d ? (
            <div className="pml-heading">
              <b>{Math.round(d.heading) % 360}&deg;</b><span>{cardinal(d.heading)}</span>
              {est && <Est why={est} />}
            </div>
          ) : <Waiting session={session} what="A compass rose that turns as the device turns, with a large heading readout." />}
          <div className="pml-note">{est ? `Estimated from ${est}. A device with a magnetometer reports this directly.` : "The dial turns so the direction the top of the device points sits under the blue marker. Phones read this from a magnetometer, so no GPS is needed."}</div>
        </div>
      }
      side={<Readout rows={[
        { k: "Heading", v: d?.heading ?? null, u: "deg", digits: 0, hot: true, inferred: est },
        { k: "Direction", v: d ? cardinal(d.heading) : null, inferred: est },
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
