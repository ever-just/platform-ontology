// The plain words layer. Raw keys, states and units become words a person would say, both ways:
// everyday requests ("where am I", "wifi", "mic") widen the capability search, and every tool result
// that changes something carries `said` (one plain sentence) and `verified` (did a read back prove it).

import type { ToolResult } from "./tools";

const STATE: Record<string, string> = {
  idle: "off", stopped: "off", requesting: "waiting for the person to allow it", granted: "on, waiting for its first reading",
  streaming: "on and sending readings", denied: "refused", unsupported: "not available in this browser", error: "failed",
};
export const plainState = (s?: unknown) => (typeof s === "string" && STATE[s]) || String(s ?? "unknown");

const WORDS: Record<string, string> = {
  hz: "readings per second", seq: "reading number", t: "time", ts: "time", lat: "latitude", latitude: "latitude",
  lng: "longitude", lon: "longitude", longitude: "longitude", alt: "altitude", altitude: "altitude in meters",
  accuracy: "accuracy in meters", acc: "accuracy", heading: "direction of travel in degrees", speed: "speed in meters per second",
  rssi: "signal strength", txPower: "transmit power", rtt: "round trip time in milliseconds", downlink: "download speed in megabits per second",
  effectiveType: "connection quality", saveData: "data saver", ua: "browser identity", userAgent: "browser identity",
  dpr: "screen pixel density", devicePixelRatio: "screen pixel density", hardwareConcurrency: "processor cores", deviceMemory: "memory in gigabytes",
  x: "side to side", y: "front to back", z: "up and down", alpha: "compass turn in degrees", beta: "front to back tilt in degrees",
  gamma: "side to side tilt in degrees", interval: "time between readings", lux: "light level in lux", illuminance: "light level in lux",
  level: "level", charging: "charging", chargingTime: "time to full in seconds", dischargingTime: "time left in seconds",
  timezone: "time zone", tz: "time zone", locale: "language and region", w: "width", h: "height", fps: "frames per second",
  db: "loudness in decibels", rms: "loudness", vid: "vendor id", pid: "product id", mime: "file type", bytes: "size in bytes",
};
export function plainKey(k: string) {
  if (WORDS[k]) return WORDS[k];
  return k.replace(/[_.-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
}

/** Plain names for the keys in a reading (two levels deep), only where they differ from the raw key. */
export function meaning(v: unknown): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const walk = (o: unknown, d: number) => {
    if (!o || typeof o !== "object" || d > 1) return;
    const obj = Array.isArray(o) ? o[0] : o;
    if (!obj || typeof obj !== "object") return;
    Object.entries(obj as Record<string, unknown>).slice(0, 30).forEach(([k, x]) => {
      const p = plainKey(k);
      if (p !== k.toLowerCase()) out[k] = p;
      walk(x, d + 1);
    });
  };
  walk(v, 0);
  return Object.keys(out).length ? out : undefined;
}

// Everyday words the person might use, mapped to words the capability names and summaries contain.
const SAY: [RegExp, string][] = [
  [/\b(where am i|my location|gps|whereabouts)\b/, "location geolocation place"],
  [/\b(mic|microphone|hear|listen|sound|noise|loud)\b/, "microphone audio"],
  [/\b(webcam|camera|see me|video)\b/, "camera video"],
  [/\b(wifi|wi-fi|internet|online|offline|connection|network)\b/, "network connection"],
  [/\b(screen share|share my screen|record the screen)\b/, "screen capture"],
  [/\b(tilt|shake|moving|movement|sensors?)\b/, "motion orientation accelerometer gyroscope"],
  [/\b(compass|direction)\b/, "orientation heading"],
  [/\b(battery|charge|power)\b/, "battery"],
  [/\b(light|bright|dark)\b/, "ambient light"],
  [/\b(alerts?|notify|notifications?)\b/, "notification"],
  [/\b(clipboard|copy|paste)\b/, "clipboard"],
  [/\b(speak|say out loud|read aloud|voice)\b/, "speech read aloud"],
  [/\b(vibrate|buzz)\b/, "vibration"],
  [/\b(files?|folders?|documents?)\b/, "file system"],
  [/\b(fingerprint|identify me|track me|who am i)\b/, "fingerprint identity"],
  [/\b(gamepad|controller|joystick)\b/, "gamepad"],
  [/\b(midi|keyboard instrument)\b/, "midi"],
  [/\b(nearby|beacon|bluetooth)\b/, "bluetooth"],
  [/\b(stay awake|keep awake|sleep)\b/, "wake lock"],
  [/\b(tab name|page title|tab title)\b/, "tab title"],
];
export function expandQuery(q: string) {
  const s = q.toLowerCase();
  const extra = SAY.filter(([re]) => re.test(s)).map(([, w]) => w);
  return extra.length ? `${q} ${extra.join(" ")}` : q;
}

/** Tools that change something; their results must say whether a read back proved it. */
const CHANGES = /^(start_|stop_|set_|run_|press_|show|point_at|turn_on|erase|draw|clear)/;

/** Add said and verified to a result, and plain names for the keys in any reading it carries. */
export function plainResult(name: string, a: Record<string, any>, r: ToolResult): ToolResult {
  if (!r.ok) {
    const why = String(r.error || r.hint || "it did not work");
    return { ...r, verified: false, said: r.said || `That did not work: ${why}` };
  }
  const out: ToolResult = { ...r };
  if (typeof out.state === "string") out.state_plain = plainState(out.state);
  const data = out.latest ?? (Array.isArray(out.records) ? (out.records as any[])[0]?.data : undefined);
  const m = data !== undefined ? meaning(data) : undefined;
  if (m) out.meaning = m;
  if (CHANGES.test(name) && out.said === undefined) {
    if (out.verified === undefined) out.verified = verifyFrom(name, a, out);
    out.said = out.verified === false ? "I sent that, but could not confirm it took effect. Check before saying it worked." : "Done, and confirmed.";
  }
  return out;
}

function verifyFrom(name: string, a: Record<string, any>, r: ToolResult): boolean | undefined {
  const st = (r.state || {}) as Record<string, unknown>;
  if (name === "set_control" && a.value !== undefined) {
    if ("checked" in st) return String(st.checked) === String(a.value === "on" ? true : a.value);
    if ("value" in st) return String(st.value) === String(a.value);
  }
  if (name === "press_control") return !st.disabled || undefined;
  return undefined;
}
