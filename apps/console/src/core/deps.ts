import { useEffect, useMemo, useState } from "react";
import type { AtlasNode, ScopeDef } from "./types";
import { getSession, useVersion } from "./harness";
import { supportOf } from "../browser/profile";
import type { Profile } from "../browser/profile";

// Dependencies: what a capability needs before it can work. A requirement is another capability,
// a permission, a context rule, a piece of hardware or a JavaScript interface. The list comes from
// a hand written table for the built in capabilities, topped up from the atlas node (its
// permission, grant type and API) for every other one.

export type ReqKind = "capability" | "permission" | "context" | "hardware" | "api";
export type ReqStatus = "met" | "unmet" | "unknown";

export type Req = {
  kind: ReqKind;
  /** Stable key within its kind: a scope id, a Permissions Policy name, an API path, and so on. */
  id: string;
  label: string;
  /** One plain sentence on why the capability needs it. */
  why: string;
};

export const KINDS: { id: ReqKind; label: string; plain: string }[] = [
  { id: "capability", label: "Capability", plain: "Another capability must work first." },
  { id: "permission", label: "Permission", plain: "The browser asks you, or a Permissions Policy must allow it." },
  { id: "context", label: "Context", plain: "The page must be in the right situation." },
  { id: "hardware", label: "Hardware", plain: "The device must have the part." },
  { id: "api", label: "Interface", plain: "The browser must offer the JavaScript interface." },
];

const cap = (id: string, label: string, why: string): Req => ({ kind: "capability", id, label, why });
const perm = (id: string, why: string, label = id): Req => ({ kind: "permission", id, label, why });
const ctx = (id: string, label: string, why: string): Req => ({ kind: "context", id, label, why });
const hw = (id: string, label: string, why: string): Req => ({ kind: "hardware", id, label, why });
const api = (id: string, label: string, why: string): Req => ({ kind: "api", id, label, why });

const SECURE = ctx("secure", "Secure context", "Browsers only offer this to pages served over https or from localhost.");
const GESTURE = ctx("gesture", "User gesture", "It only starts from a click or tap, so a page cannot trigger it on its own.");
const TOP = ctx("toplevel", "Top level frame", "Inside an embedded frame it is blocked unless the page allows it with an allow attribute.");
const VISIBLE = ctx("visible", "Page visible", "It stops or refuses while the tab is hidden.");
const FOCUSED = ctx("focused", "Page focused", "The browser only serves it to the tab that has focus.");
const ONLINE = ctx("online", "Network online", "It needs a connection to work.");
const IOS_GESTURE = ctx("gesture", "Gesture (iOS)", "On iOS the permission call, DeviceOrientationEvent.requestPermission, must run from a tap.");

/** Hand written dependencies for the built in capabilities. An empty list is a finding: no prompt. */
const TABLE: Record<string, Req[]> = {
  "place.geolocation": [
    SECURE, TOP,
    perm("geolocation", "Position is personal, so the browser asks first."),
    hw("gps", "GPS or Wi-Fi positioning", "The fix comes from satellites, Wi-Fi networks or cell towers."),
    api("navigator.geolocation", "Geolocation API", "The interface that returns the position."),
  ],
  "place.timezone": [api("Intl.DateTimeFormat", "Intl API", "Reads the time zone from the system settings.")],
  "place.compass": [
    cap("motion.orientation", "Device orientation", "A heading is worked out from the same orientation stream."),
    SECURE, IOS_GESTURE,
    perm("magnetometer", "Chromium gates the compass sensor behind the magnetometer permission."),
    hw("magnetometer", "Magnetometer", "The compass reads the magnetic field of the Earth."),
    api("ondeviceorientationabsolute", "Absolute orientation", "The event that reports a heading against magnetic north."),
  ],
  "motion.orientation": [
    SECURE, IOS_GESTURE,
    perm("gyroscope", "Chromium gates orientation sensors behind sensor permissions."),
    hw("gyroscope", "Gyroscope", "Tilt is fused from the motion sensors."),
    api("DeviceOrientationEvent", "DeviceOrientationEvent", "The event that reports tilt."),
  ],
  "motion.accelerometer": [
    SECURE, IOS_GESTURE,
    perm("accelerometer", "Chromium gates motion sensors behind the accelerometer permission."),
    hw("accelerometer", "Accelerometer", "Shakes and steps come from acceleration readings."),
    api("DeviceMotionEvent", "DeviceMotionEvent", "The event that reports acceleration."),
  ],
  "motion.pointer": [api("PointerEvent", "Pointer events", "Every page can listen to them.")],
  "motion.keystroke": [FOCUSED, api("KeyboardEvent", "Keyboard events", "Key timing arrives as ordinary events.")],
  "motion.attention": [api("document.visibilityState", "Page Visibility API", "Reports whether the tab is in front.")],
  "capture.camera": [
    SECURE, TOP,
    perm("camera", "Turning on a camera always needs consent."),
    hw("camera", "Camera", "There must be a camera to open."),
    api("navigator.mediaDevices.getUserMedia", "getUserMedia", "The call that opens the camera."),
  ],
  "capture.microphone": [
    SECURE, TOP,
    perm("microphone", "Listening always needs consent."),
    hw("microphone", "Microphone", "There must be a microphone to open."),
    api("navigator.mediaDevices.getUserMedia", "getUserMedia", "The call that opens the microphone."),
  ],
  "capture.screen": [
    SECURE, GESTURE,
    perm("display-capture", "You pick the screen, window or tab in a browser chooser each time."),
    api("navigator.mediaDevices.getDisplayMedia", "getDisplayMedia", "The call that starts a screen capture."),
  ],
  "capture.speech": [
    cap("capture.microphone", "Microphone", "Speech to text listens through the microphone."),
    SECURE, ONLINE,
    perm("microphone", "The recogniser opens the microphone, so it asks for the same consent."),
    hw("microphone", "Microphone", "There must be a microphone to listen with."),
    api("SpeechRecognition", "SpeechRecognition", "The interface that turns audio into text (webkit prefixed in Chromium)."),
  ],
  "capture.light": [
    SECURE,
    perm("ambient-light-sensor", "Light level can reveal a room, so it sits behind a permission."),
    hw("ambient-light", "Ambient light sensor", "The reading comes from a light sensor next to the screen."),
    api("AmbientLightSensor", "AmbientLightSensor", "Only offered behind a flag in a few browsers."),
  ],
  "capture.clipboard": [
    SECURE, GESTURE, FOCUSED,
    perm("clipboard-read", "What you copied can be private, so reading asks first."),
    api("navigator.clipboard", "Async Clipboard API", "The interface that reads and writes the clipboard."),
  ],
  "device.battery": [
    SECURE,
    hw("battery", "Battery", "Desktops without a battery report nothing useful."),
    api("navigator.getBattery", "Battery Status API", "Offered in Chromium only."),
  ],
  "device.profile": [api("navigator.userAgentData", "User agent and screen", "Model and system details are readable by any page.")],
  "device.storage": [api("navigator.storage", "Storage API", "Reports how much space the site may use.")],
  "device.pressure": [
    SECURE,
    perm("compute-pressure", "Load patterns can hint at what else you are running."),
    hw("cpu", "Processor", "It reads the state of the processor."),
    api("PressureObserver", "Compute Pressure API", "Offered in Chromium only."),
  ],
  "device.screens": [
    SECURE, GESTURE,
    perm("window-management", "Screen layout reveals your desk, so it needs consent."),
    hw("screens", "Several displays", "It is most useful with more than one screen."),
    api("window.getScreenDetails", "Window Management API", "Offered in Chromium only."),
  ],
  "fingerprint.canvas": [api("HTMLCanvasElement.prototype.toDataURL", "Canvas API", "Any page can draw and read pixels. No permission, no prompt, no gesture.")],
  "fingerprint.fonts": [
    SECURE, GESTURE,
    perm("local-fonts", "The installed font list is a strong identifier, so it asks first."),
    api("window.queryLocalFonts", "Local Font Access API", "Offered in Chromium only."),
  ],
  "link.network": [api("navigator.connection", "Network Information API", "Offered in Chromium only.")],
  "link.timing": [ONLINE, api("performance", "Performance API", "Request times come from the timing entries.")],
  "identity.passkeys": [
    SECURE,
    hw("authenticator", "Authenticator", "A platform authenticator or a security key must be available."),
    api("PublicKeyCredential", "WebAuthn", "The interface behind passkeys."),
  ],
  "identity.contacts": [
    SECURE, GESTURE, TOP,
    api("navigator.contacts", "Contact Picker API", "Offered on Android Chrome only."),
  ],
  "identity.storage_tracking": [api("localStorage", "Web Storage", "Any page can store data. No permission.")],
  "reach.wake_lock": [
    SECURE, VISIBLE,
    perm("screen-wake-lock", "The browser may refuse, for example on low battery."),
    api("navigator.wakeLock", "Screen Wake Lock API", "The interface that keeps the screen on."),
  ],
  "surroundings.bluetooth": [
    SECURE, GESTURE, TOP,
    perm("bluetooth", "You choose the device in a browser chooser."),
    hw("bluetooth", "Bluetooth radio", "The device needs a working radio."),
    api("navigator.bluetooth", "Web Bluetooth", "Offered in Chromium only."),
  ],
  "surroundings.media_devices": [
    cap("capture.camera", "Camera", "Device names stay blank until a camera or microphone is granted."),
    cap("capture.microphone", "Microphone", "Device names stay blank until a camera or microphone is granted."),
    SECURE,
    api("navigator.mediaDevices.enumerateDevices", "enumerateDevices", "The call that lists media devices."),
  ],
  "surroundings.usb": [
    SECURE, GESTURE, TOP,
    perm("usb", "You choose the device in a browser chooser."),
    hw("usb", "USB device", "A device must be plugged in."),
    api("navigator.usb", "WebUSB", "Offered in Chromium only."),
  ],
  "surroundings.serial": [
    SECURE, GESTURE, TOP,
    perm("serial", "You choose the port in a browser chooser."),
    hw("serial", "Serial device", "A device must be connected."),
    api("navigator.serial", "Web Serial", "Offered in Chromium only."),
  ],
  "surroundings.hid": [
    SECURE, GESTURE, TOP,
    perm("hid", "You choose the device in a browser chooser."),
    hw("hid", "HID device", "An input device must be connected."),
    api("navigator.hid", "WebHID", "Offered in Chromium only."),
  ],
  "surroundings.midi": [
    SECURE, GESTURE,
    perm("midi", "Instruments can be controlled, so access asks first."),
    hw("midi", "MIDI instrument", "An instrument must be connected."),
    api("navigator.requestMIDIAccess", "Web MIDI", "Offered in Chromium and Firefox."),
  ],
  "surroundings.gamepad": [
    GESTURE,
    hw("gamepad", "Gamepad", "A controller must be connected, and a button press wakes it."),
    api("navigator.getGamepads", "Gamepad API", "Every page can poll controllers."),
  ],
  "surroundings.nfc": [
    SECURE, GESTURE,
    perm("nfc", "Reading tags asks first."),
    hw("nfc", "NFC radio", "The phone needs an NFC reader."),
    api("NDEFReader", "Web NFC", "Offered on Android Chrome only."),
  ],
};

const GRANT_CTX: Record<string, Req | undefined> = {
  gesture: GESTURE,
  picker: ctx("gesture", "User gesture", "You choose in a browser chooser, which opens from a click."),
  install: ctx("installed", "Installed app", "It only works once the site is installed as an app."),
  settings: ctx("setting", "Browser setting", "A browser or site setting must switch it on."),
  "origin-trial": ctx("trial", "Origin trial", "The site needs an origin trial token while the feature is experimental."),
  enterprise: ctx("managed", "Managed browser", "Only a managed browser with a policy offers it."),
};

const KNOWN_PERMS = /^[a-z]+(-[a-z]+)*$/;

function nodeReqs(scope: ScopeDef, node?: AtlasNode): Req[] {
  const out: Req[] = [];
  if (node?.perm) {
    // perm reads like "camera, microphone (for labels)" or "accelerometer, gyroscope, magnetometer (Chromium)".
    const clean = node.perm.replace(/\([^)]*\)/g, " ").split(/[,;]| or /).map((p) => p.trim().split(" ")[0]).filter((p) => p && KNOWN_PERMS.test(p));
    clean.slice(0, 4).forEach((p) => out.push(perm(p, "The atlas lists this Permissions Policy name for it.")));
  } else if (scope.permission) {
    out.push(perm(scope.permission, "It asks through the Permissions API."));
  }
  const g = node?.gr ? GRANT_CTX[node.gr] : undefined;
  if (g) out.push(g);
  else if (scope.gesture || node?.gr === "prompt") out.push(GESTURE);
  if (out.length && !scope.passive) out.unshift(SECURE);
  const first = node?.api?.split(/[;\n]/)[0]?.trim();
  if (first) {
    const path = first.replace(/\(.*$/, "").replace(/<[^>]*>/g, "").trim().slice(0, 60) || first;
    out.push(api(path, path.length > 26 ? path.slice(0, 25) + "..." : path, "The interface the atlas names for it."));
  } else if (scope.call) {
    out.push(api(scope.call, "Script call", "Its entry point in this console."));
  }
  return out;
}

const dedupe = (rs: Req[]): Req[] => {
  const seen = new Set<string>();
  return rs.filter((r) => { const k = r.kind + ":" + r.id; if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Every requirement of one capability. `known` drops capability links to scopes that do not exist. */
export function requirementsOf(scope: ScopeDef, node?: AtlasNode, known?: Set<string>): Req[] {
  const base = TABLE[scope.id] ?? nodeReqs(scope, node);
  const list = dedupe(base).filter((r) => r.kind !== "capability" || !known || known.has(r.id));
  // Capabilities first, then the order of KINDS, so the graph groups by kind.
  const rank = (r: Req) => KINDS.findIndex((k) => k.id === r.kind);
  return list.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
}

/** True when nothing but the interface is needed: no permission, no gesture, no hardware. */
export const isSilent = (reqs: Req[]) => reqs.every((r) => r.kind === "api");

/** Reverse map: for each capability, the capabilities that list it as a requirement. */
export function unlocksMap(scopes: ScopeDef[], nodeOf: (s: ScopeDef) => AtlasNode | undefined): Map<string, string[]> {
  const known = new Set(scopes.map((s) => s.id));
  const m = new Map<string, string[]>();
  for (const s of scopes) {
    for (const r of requirementsOf(s, nodeOf(s), known)) {
      if (r.kind !== "capability") continue;
      const a = m.get(r.id) || [];
      a.push(s.id);
      m.set(r.id, a);
    }
  }
  return m;
}

/** Capability to capability edges across the whole console: [needed, dependent]. */
export function capabilityEdges(scopes: ScopeDef[], nodeOf: (s: ScopeDef) => AtlasNode | undefined): [string, string][] {
  const out: [string, string][] = [];
  unlocksMap(scopes, nodeOf).forEach((deps, id) => deps.forEach((d) => out.push([id, d])));
  return out;
}

// Checking this browser ----------------------------------------------------------------------

const w = window as any;
const walk = (path: string): boolean => {
  try {
    let o: any = w;
    for (const p of path.split(".")) { if (o == null || !(p in Object(o))) return false; o = o[p]; }
    return true;
  } catch { return false; }
};

/** Quick checks that need no waiting. Anything else is unknown until it is asked. */
function syncStatus(r: Req, profile: Profile): ReqStatus {
  if (r.kind === "api") {
    if (r.id === "SpeechRecognition") return walk("SpeechRecognition") || walk("webkitSpeechRecognition") ? "met" : "unmet";
    return /^[A-Za-z_$][\w$]*(\.[\w$]+)*$/.test(r.id) ? (walk(r.id) ? "met" : "unmet") : "unknown";
  }
  if (r.kind === "context") {
    switch (r.id) {
      case "secure": return w.isSecureContext ? "met" : "unmet";
      case "toplevel": return w.top === w ? "met" : "unmet";
      case "visible": return document.visibilityState === "visible" ? "met" : "unmet";
      case "focused": return document.hasFocus() ? "met" : "unmet";
      case "online": return navigator.onLine ? "met" : "unmet";
      case "installed": return profile.standalone ? "met" : "unmet";
      default: return "unknown"; // a gesture is a moment, not a state
    }
  }
  if (r.kind === "hardware") {
    switch (r.id) {
      case "magnetometer": return "Magnetometer" in w || "ondeviceorientationabsolute" in w ? "unknown" : "unmet";
      case "battery": return walk("navigator.getBattery") ? "unknown" : "unmet";
      case "bluetooth": return walk("navigator.bluetooth") ? "unknown" : "unmet";
      case "gps": return walk("navigator.geolocation") ? "unknown" : "unmet";
      case "usb": return walk("navigator.usb") ? "unknown" : "unmet";
      case "serial": return walk("navigator.serial") ? "unknown" : "unmet";
      case "hid": return walk("navigator.hid") ? "unknown" : "unmet";
      case "midi": return walk("navigator.requestMIDIAccess") ? "unknown" : "unmet";
      case "nfc": return walk("NDEFReader") ? "unknown" : "unmet";
      default: return "unknown";
    }
  }
  return "unknown";
}

const asyncCache = new Map<string, ReqStatus>();

/** Checks that must wait: Permissions API states and the count of media devices (no prompt needed). */
async function asyncStatus(r: Req): Promise<ReqStatus> {
  try {
    if (r.kind === "permission") {
      if (!navigator.permissions?.query) return "unknown";
      const st = await navigator.permissions.query({ name: r.id as PermissionName });
      return st.state === "granted" ? "met" : st.state === "denied" ? "unmet" : "unknown"; // prompt: not yet, but possible
    }
    if (r.kind === "hardware" && (r.id === "camera" || r.id === "microphone")) {
      if (!navigator.mediaDevices?.enumerateDevices) return "unmet";
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.some((d) => d.kind === (r.id === "camera" ? "videoinput" : "audioinput")) ? "met" : "unmet";
    }
    if (r.kind === "hardware" && r.id === "bluetooth" && (navigator as any).bluetooth?.getAvailability) {
      return (await (navigator as any).bluetooth.getAvailability()) ? "met" : "unmet";
    }
    if (r.kind === "hardware" && r.id === "battery" && (navigator as any).getBattery) {
      await (navigator as any).getBattery();
      return "met";
    }
  } catch { /* a refused or unknown query is just unknown */ }
  return "unknown";
}

const keyOf = (r: Req) => r.kind + ":" + r.id;

/** Status of another capability, from its live session first and its browser support second. */
function capStatus(id: string, nodeOf: (id: string) => AtlasNode | undefined, profile: Profile): ReqStatus {
  const s = getSession(id);
  if (s.state === "granted" || s.state === "streaming") return "met";
  if (s.state === "denied" || s.state === "unsupported" || s.state === "error") return "unmet";
  const n = nodeOf(id);
  if (!n) return "unknown";
  const c = supportOf(n.sup, profile.column);
  return c === "y" ? "met" : c === "n" ? "unmet" : "unknown";
}

export type DepInfo = {
  reqs: Req[];
  status: Record<string, ReqStatus>;
  unlocks: string[];
  met: number;
  unmet: number;
  unknown: number;
  silent: boolean;
};

type DepCtx = { scopes: ScopeDef[]; profile: Profile; nodeOf: (s: ScopeDef) => AtlasNode | undefined };

export { keyOf as reqKey };

/** Requirements, their status in this browser, and what the capability unlocks. Re-renders when sessions change. */
export function useDeps(scope: ScopeDef, c: DepCtx): DepInfo {
  const v = useVersion();
  const known = useMemo(() => new Set(c.scopes.map((s) => s.id)), [c.scopes]);
  const reqs = useMemo(() => requirementsOf(scope, c.nodeOf(scope), known), [scope, c, known]);
  const unlocks = useMemo(() => unlocksMap(c.scopes, c.nodeOf).get(scope.id) || [], [scope.id, c.scopes, c.nodeOf]);
  const [later, setLater] = useState<Record<string, ReqStatus>>({});
  useEffect(() => {
    let live = true;
    reqs.forEach((r) => {
      const k = keyOf(r);
      const hit = asyncCache.get(k);
      if (hit) { setLater((p) => (p[k] === hit ? p : { ...p, [k]: hit })); return; }
      if (r.kind !== "permission" && !(r.kind === "hardware")) return;
      void asyncStatus(r).then((s) => { if (r.kind === "permission") asyncCache.set(k, s); if (live) setLater((p) => (p[k] === s ? p : { ...p, [k]: s })); });
    });
    return () => { live = false; };
  }, [reqs]);
  const byId = useMemo(() => new Map(c.scopes.map((s) => [s.id, s])), [c.scopes]);
  const status = useMemo(() => {
    const out: Record<string, ReqStatus> = {};
    for (const r of reqs) {
      const k = keyOf(r);
      if (r.kind === "capability") out[k] = capStatus(r.id, (id) => { const s = byId.get(id); return s ? c.nodeOf(s) : undefined; }, c.profile);
      else {
        const s = syncStatus(r, c.profile);
        const a = later[k];
        // A definite async answer beats a "maybe" from feature detection, never an outright missing API.
        out[k] = s === "unmet" ? s : a && a !== "unknown" ? a : s;
      }
    }
    return out;
    // v makes capability statuses follow live sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqs, later, c.profile, byId, c.nodeOf, v]);
  const vals = Object.values(status);
  return { reqs, status, unlocks, met: vals.filter((x) => x === "met").length, unmet: vals.filter((x) => x === "unmet").length, unknown: vals.filter((x) => x === "unknown").length, silent: isSilent(reqs) };
}

/** Static count for list rows: how many requirements, without checking the browser. */
export function depCount(scope: ScopeDef, node?: AtlasNode, known?: Set<string>): number {
  return requirementsOf(scope, node, known).length;
}
