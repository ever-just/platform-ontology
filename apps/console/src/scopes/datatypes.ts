import type { DataKind, Metric, ScopeDef } from "../core/types";
import { inferKind } from "../core/datatype";

// The data type of every capability's headline, plus the kind of each declared metric.
// One row per scope id: the first entry is the primary value the row and the voice agent lead with.
// Keys read the latest record (`data[key]`), or a named row of a generic `fields` table.
// Reference entries all lead with availability (ordinal), set in applyTypes below.

type Spec = [key: string, label: string, type: DataKind, extra?: { unit?: string; options?: string[]; digits?: number }];

const PERMISSION = ["granted", "denied", "prompt", "default"];
const PRESSURE = ["nominal", "fair", "serious", "critical"];
const ECT = ["slow-2g", "2g", "3g", "4g"];
const AI_AVAIL = ["unavailable", "downloadable", "downloading", "available"];

export const TYPES: Record<string, Spec[]> = {
  // place
  "place.geolocation": [["@geo", "Position", "geo"], ["lat", "Latitude", "interval", { unit: "°" }], ["lon", "Longitude", "interval", { unit: "°" }], ["accuracy", "Accuracy", "ratio", { unit: "m" }], ["speed", "Speed", "ratio", { unit: "m/s" }]],
  "place.timezone": [["timezone", "Time zone", "nominal"], ["offset_h", "UTC offset", "interval", { unit: "h" }], ["locale", "Locale", "nominal"], ["languages", "Languages", "set"]],
  "place.compass": [["heading", "Heading", "interval", { unit: "°", digits: 0 }]],
  "place.local-network-access": [["local-network-access", "Local network", "nominal", { options: PERMISSION }]],
  // motion
  "motion.orientation": [["beta", "Front to back tilt", "interval", { unit: "°", digits: 0 }], ["alpha", "Turn", "interval", { unit: "°" }], ["gamma", "Side tilt", "interval", { unit: "°" }]],
  "motion.accelerometer": [["mag", "Movement", "ratio", { unit: "m/s²" }], ["peak", "Peak", "ratio", { unit: "m/s²" }], ["steps", "Steps", "count"]],
  "motion.pointer": [["speed", "Pointer speed", "ratio", { unit: "px/s", digits: 0 }], ["dist", "Distance", "ratio", { unit: "px" }], ["clicks", "Clicks", "count"]],
  "motion.keystroke": [["kpm", "Typing speed", "ratio", { unit: "keys/min", digits: 0 }], ["mean_dwell", "Key hold", "ratio", { unit: "ms" }], ["mean_flight", "Between keys", "ratio", { unit: "ms" }]],
  "motion.attention": [["state", "Tab is", "nominal", { options: ["visible", "hidden"] }], ["visible_s", "Time visible", "ratio", { unit: "s" }], ["hidden_s", "Time hidden", "ratio", { unit: "s" }], ["switches", "Tab switches", "count"]],
  "motion.tab-title": [["title", "Tab title", "text"], ["visible", "Tab visible", "boolean"], ["badge", "Badge", "count"]],
  "motion.drag-and-drop": [["drops", "Drops", "count"], ["drags", "Drags", "count"], ["types", "Dropped types", "set"]],
  "motion.pointer-lock": [["movementX/Y", "Movement", "ratio", { unit: "px" }]],
  "motion.keyboard-lock": [["status", "Keyboard lock", "nominal", { options: PERMISSION }]],
  "motion.virtual-keyboard": [["Overlays content", "Overlays content", "boolean"], ["Keyboard height now", "Keyboard height", "ratio", { unit: "px" }]],
  // surroundings
  "surroundings.bluetooth": [["count", "Devices nearby", "count"], ["nearest_m", "Nearest", "ratio", { unit: "m" }], ["strongest_dbm", "Strongest signal", "interval", { unit: "dBm" }]],
  "surroundings.media_devices": [["devices", "Devices", "set"], ["cams", "Cameras", "count"], ["mics", "Microphones", "count"]],
  "surroundings.usb": [["count", "USB devices", "count"], ["devices", "Devices", "set"]],
  "surroundings.serial": [["count", "Serial ports", "count"], ["devices", "Ports", "set"]],
  "surroundings.hid": [["count", "HID devices", "count"], ["devices", "Devices", "set"]],
  "surroundings.midi": [["input_count", "MIDI inputs", "count"], ["notes_total", "Notes played", "count"], ["last_velocity", "Last velocity", "ratio", { digits: 0 }]],
  "surroundings.gamepad": [["connected", "Gamepads", "count"], ["pressed", "Buttons held", "count"], ["lx", "Left stick X", "interval"]],
  "surroundings.nfc": [["count", "Tags read", "count"], ["records_total", "Records", "count"], ["last_serial", "Last tag", "identifier"]],
  "surroundings.read-aloud": [["voices", "Voices", "count"], ["speaking", "Speaking", "boolean"], ["langs", "Languages", "count"]],
  "surroundings.tone": [["playing", "Tone playing", "boolean"], ["freq", "Frequency", "ratio", { unit: "Hz", digits: 0 }], ["state", "Audio engine", "nominal", { options: ["suspended", "running", "closed"] }]],
  "surroundings.print": [["before", "Print events", "count"], ["blocked", "Blocked", "count"]],
  "surroundings.autoplay": [["elem", "Video autoplay", "ordinal", { options: ["disallowed", "allowed-muted", "allowed"] }], ["audio", "Audio autoplay", "ordinal", { options: ["disallowed", "allowed-muted", "allowed"] }]],
  "surroundings.presentation-api": [["A screen is available", "Second screen", "boolean"]],
  "surroundings.webxr-immersive": [["viewerPose.transform.position", "Head position", "ratio", { unit: "m" }]],
  // capture
  "capture.camera": [["faces", "Faces in view", "count"], ["fps", "Frame rate", "ratio", { unit: "fps", digits: 0 }], ["brightness", "Brightness", "ratio", { digits: 0 }]],
  "capture.microphone": [["db", "Loudness", "interval", { unit: "dB", digits: 0 }], ["peak_hz", "Main pitch", "ratio", { unit: "Hz", digits: 0 }], ["rms", "Level", "ratio"]],
  "capture.screen": [["surface", "Sharing", "nominal", { options: ["monitor", "window", "browser"] }], ["width", "Width", "ratio", { unit: "px" }], ["height", "Height", "ratio", { unit: "px" }]],
  "capture.speech": [["interim", "Heard", "text"], ["words", "Words", "count"], ["wpm", "Speaking rate", "ratio", { unit: "wpm", digits: 0 }]],
  "capture.light": [["lux", "Room light", "ratio", { unit: "lux", digits: 0 }]],
  "capture.clipboard": [["kind", "Clipboard holds", "nominal", { options: ["text", "url", "email", "number", "code", "empty"] }], ["length", "Length", "count"]],
  "capture.clipboard-write": [["text/plain", "Plain text", "text"]],
  "capture.copy-event": [["mode", "Copy handling", "nominal", { options: ["off", "append", "replace", "block"] }], ["copies", "Copies", "count"]],
  "capture.camera-pip": [["active", "Picture in picture", "boolean"], ["supported", "Supported", "boolean"]],
  "capture.keyboard-layout-map": [["Keys mapped", "Keys mapped", "count"], ["Letters on Q W E Y Z keys", "Layout", "text"]],
  "capture.barcode-detection": [["Barcode types readable", "Reads barcodes", "boolean"], ["Types", "Formats", "set"]],
  "capture.summarizer-api": [["type", "Summary type", "nominal"]],
  "capture.translator-api": [["availability", "Translator", "ordinal", { options: AI_AVAIL }]],
  "capture.language-detector": [["detectedLanguage", "Language", "nominal"], ["confidence", "Confidence", "ratio"]],
  "capture.prompt-api": [["availability", "Built in AI", "ordinal", { options: AI_AVAIL }], ["contextWindow", "Context window", "count"]],
  "capture.writer-api": [["tone", "Tone", "nominal"]],
  "capture.rewriter-api": [["tone", "Tone", "nominal"]],
  "capture.proofreader-api": [["corrections[]", "Corrections", "set"]],
  "capture.gemini-nano-requirements": [["storage", "Free disk", "ratio", { unit: "GB" }], ["data sent to Google", "Sends data to Google", "boolean"]],
  "capture.camera-ptz": [["zoom", "Zoom", "ratio", { unit: "x" }], ["pan", "Pan", "interval"], ["tilt", "Tilt", "interval"]],
  "capture.captured-surface-control": [["zoom level", "Zoom level", "ratio", { unit: "%" }]],
  "capture.region-element-capture": [["status", "Region capture", "nominal", { options: PERMISSION }]],
  "capture.edit-context": [["Attached", "EditContext attached", "boolean"], ["Text model", "Text", "text"]],
  // device
  "device.battery": [["level", "Battery", "ratio", { unit: "%", digits: 0 }], ["charging", "Charging", "boolean"], ["discharging_time", "Time left", "ratio", { unit: "s" }]],
  "device.battery-status": [["Battery level", "Battery", "ratio", { unit: "%" }], ["Charging", "Charging", "boolean"]],
  "device.profile": [["platform", "System", "nominal"], ["cores", "Processor threads", "count"], ["memory", "Memory", "ratio", { unit: "GB" }], ["bits", "Identifying bits", "ratio", { unit: "bits" }]],
  "device.storage": [["pct", "Storage used", "ratio", { unit: "%", digits: 3 }], ["persisted", "Persistent", "boolean"], ["quota", "Quota", "ratio", { unit: "B" }]],
  "device.pressure": [["state", "CPU pressure", "ordinal", { options: PRESSURE }], ["level", "Pressure level", "ordinal", { options: ["0", "1", "2", "3"] }], ["load", "Load", "ratio"]],
  "device.screens": [["count", "Screens", "count"], ["extended", "Extended desktop", "boolean"]],
  "device.theme-color": [["color", "Theme color", "color"], ["dark", "Dark variant", "boolean"]],
  "device.page-zoom": [["rel", "Zoom", "ratio", { unit: "x" }], ["dpr", "Pixel ratio", "ratio"]],
  "device.custom-cursor": [["kind", "Cursor", "nominal", { options: ["default", "custom", "hidden", "fake"] }], ["moves", "Moves", "count"]],
  "device.scroll-control": [["mode", "Scrolling", "nominal", { options: ["free", "snap", "hijack", "locked"] }], ["pct", "Scrolled", "ratio", { unit: "%" }]],
  "device.window-move-resize": [["open", "Popup open", "boolean"], ["canMove", "Can move windows", "boolean"]],
  "device.orientation-lock": [["type", "Orientation", "nominal", { options: ["portrait-primary", "portrait-secondary", "landscape-primary", "landscape-secondary"] }], ["locked", "Locked to", "nominal"]],
  "device.video-pip": [["active", "Picture in picture", "boolean"], ["supported", "Supported", "boolean"]],
  "device.eyedropper": [["sRGBHex", "Picked color", "color"]],
  "device.webgpu-adapter": [["Maker", "GPU maker", "nominal"], ["Chip family", "Chip family", "nominal"], ["Largest buffer", "Largest buffer", "ratio", { unit: "MB" }]],
  "device.refresh-rate-measurement": [["Refresh rate", "Refresh rate", "ratio", { unit: "Hz", digits: 0 }], ["Time per frame", "Frame time", "ratio", { unit: "ms" }]],
  "device.cpu-benchmark": [["Speed score", "Speed score", "ratio", { unit: "M ops/s", digits: 0 }], ["Time for 20 million calculations", "Time", "ratio", { unit: "ms" }]],
  "device.performance-memory": [["Memory in use by this page", "Page memory", "ratio", { unit: "MB" }], ["Memory limit", "Limit", "ratio", { unit: "MB" }]],
  "device.measure-user-agent-memory": [["bytes", "Memory", "ratio", { unit: "bytes" }]],
  "device.compute-pressure": [["CPU state", "CPU pressure", "ordinal", { options: PRESSURE }], ["Samples", "Samples", "count"]],
  "device.long-animation-frames": [["Frames over 50 ms", "Slow frames", "count"], ["Worst frame", "Worst frame", "ratio", { unit: "ms" }]],
  "device.page-lifecycle-bfcache": [["Visibility", "Page is", "nominal", { options: ["visible", "hidden"] }], ["Was discarded", "Was discarded", "boolean"], ["Navigation type", "Navigation", "nominal"]],
  "device.document-pip": [["status", "Document picture in picture", "nominal", { options: PERMISSION }]],
  // fingerprint
  "fingerprint.canvas": [["bits", "Identifying bits", "ratio", { unit: "bits", digits: 1 }], ["canvas_hash", "Canvas hash", "identifier"], ["canvas_bits", "Canvas", "ratio", { unit: "bits" }], ["audio_bits", "Audio", "ratio", { unit: "bits" }]],
  "fingerprint.fonts": [["count", "Fonts found", "count"], ["present", "Fonts", "set"]],
  "fingerprint.extension-traces": [["known", "Extensions spotted", "set"], ["added", "Page changes", "count"]],
  "fingerprint.permissions-policy": [["features", "Policy features", "set"], ["supported", "API present", "boolean"]],
  "fingerprint.speechsynthesis-voices": [["localService", "On device voice", "boolean"], ["lang", "Language", "nominal"]],
  // link
  "link.network": [["effectiveType", "Connection", "ordinal", { options: ECT }], ["rtt_ms", "Round trip", "ratio", { unit: "ms", digits: 0 }], ["downlink", "Download", "ratio", { unit: "Mbps", digits: 1 }], ["jitter_ms", "Jitter", "ratio", { unit: "ms" }], ["type", "Link", "nominal"], ["online", "Online", "boolean"]],
  "link.timing": [["ttfb_ms", "First byte", "ratio", { unit: "ms", digits: 0 }], ["total_ms", "Total", "ratio", { unit: "ms" }], ["count", "Requests", "count"]],
  "link.client-hints": [["Platform", "Platform", "nominal"], ["Mobile", "Mobile", "boolean"], ["Brands", "Brands", "set"]],
  "link.device-client-hints": [["Device memory", "Device memory", "ratio", { unit: "GB" }], ["DPR", "Pixel ratio", "ratio"]],
  "link.ect-client-hints": [["Effective type", "Connection", "ordinal", { options: ECT }], ["RTT", "Round trip", "ratio", { unit: "ms" }], ["Save-Data", "Save data", "boolean"]],
  // identity
  "identity.passkeys": [["supported", "Sign in methods", "count"], ["caps_count", "Capabilities", "count"]],
  "identity.contacts": [["count", "Contacts picked", "count"], ["with_email", "With email", "count"], ["with_tel", "With phone", "count"]],
  "identity.storage_tracking": [["score", "Tracking exposure", "ratio", { unit: "%", digits: 0 }], ["available", "Stores open", "count"]],
  "identity.window-name": [["value", "window.name", "text"], ["length", "Length", "count"]],
  "identity.webauthn-create": [["Built in fingerprint or face unlock available", "Device unlock", "boolean"], ["Passkey autofill available", "Passkey autofill", "boolean"]],
  "identity.webauthn-signal": [["facts", "Checks", "set"]],
  "identity.file-system-access-pickers": [["status", "File pickers", "nominal", { options: PERMISSION }]],
  "identity.directory-picker": [["status", "Folder picker", "nominal", { options: PERMISSION }]],
  "identity.file-system-access": [["mode", "Access", "nominal"]],
  "identity.password-credential-management": [["password", "Saved password", "text"]],
  "identity.payment-request": [["methodName", "Payment method", "nominal"]],
  "identity.secure-payment-confirmation": [["payeeOrigin", "Payee", "text"]],
  "identity.fetchlater": [["Queued", "Queued", "boolean"], ["Sent", "Sent", "boolean"]],
  "identity.speculation-rules-prefetch": [["Rules supported", "Speculation rules", "boolean"], ["Delivery type", "Delivery", "nominal"]],
  "identity.third-party-cookies-status": [["Has storage access", "Storage access", "boolean"], ["Cookies enabled", "Cookies", "boolean"]],
  "identity.get-installed-related-apps": [["Apps found", "Related apps", "count"]],
  // reach
  "reach.notifications": [["permission", "Notifications", "nominal", { options: PERMISSION }], ["sent", "Sent", "count"]],
  "reach.wake_lock": [["active", "Screen kept on", "boolean"], ["held_s", "Held for", "ratio", { unit: "s" }], ["releases", "Releases", "count"]],
  "reach.vibration": [["pattern", "Pattern", "nominal"], ["pulses", "Pulses", "count"], ["sends", "Sends", "count"]],
  "reach.badging": [["badge", "Badge", "count"], ["sets", "Times set", "count"]],
  "reach.address-bar": [["path", "Address", "text"], ["pushed", "History entries added", "count"]],
  "reach.fullscreen": [["active", "Full screen", "boolean"], ["enabled", "Allowed", "boolean"]],
  "reach.leave-warning": [["armed", "Leave warning armed", "boolean"]],
  "reach.cookies": [["count", "Cookies", "count"], ["api", "API", "nominal", { options: ["cookieStore", "document.cookie"] }]],
  "reach.download": [["count", "Downloads", "count"], ["name", "Last file", "text"]],
  "reach.compression": [["ratio", "Compression ratio", "ratio", { unit: "x" }], ["format", "Format", "nominal", { options: ["gzip", "deflate", "deflate-raw"] }]],
  "reach.isolation": [["isolated", "Cross origin isolated", "boolean"], ["coop", "COOP header", "nominal"], ["secure", "Secure context", "boolean"]],
  "reach.timer-throttle": [["visAvg", "Timer interval", "ratio", { unit: "ms", digits: 0 }], ["hidAvg", "When hidden", "ratio", { unit: "ms" }]],
  "reach.scheduler": [["postTask", "scheduler.postTask", "boolean"], ["spreadMs", "Spread", "ratio", { unit: "ms" }]],
  "reach.beacon": [["sent", "Beacons sent", "count"], ["bytes", "Bytes", "ratio", { unit: "B" }]],
  "reach.cache": [["caches", "Caches", "set"], ["readMs", "Read time", "ratio", { unit: "ms" }]],
  "reach.prefetch": [["supported", "Speculation rules", "boolean"], ["eagerness", "Eagerness", "ordinal", { options: ["conservative", "moderate", "eager", "immediate"] }]],
  "reach.crypto": [["digestMBs", "SHA-256 speed", "ratio", { unit: "MB/s" }], ["verified", "Signature verified", "boolean"]],
  "reach.workers": [["speedup", "Speedup", "ratio", { unit: "x" }], ["cores", "Cores", "count"]],
  "reach.wasm": [["compileMs", "Compile time", "ratio", { unit: "ms" }], ["match", "Matches JS", "boolean"]],
  "reach.codecs": [["supported", "Codec supported", "boolean"], ["fps", "Encode speed", "ratio", { unit: "fps" }]],
  "reach.webmcp": [["registered", "Tool registered", "boolean"], ["calls", "Calls", "count"]],
  "reach.datachannel": [["channel", "Data channel", "ordinal", { options: ["connecting", "open", "closing", "closed"] }], ["rttAvg", "Round trip", "ratio", { unit: "ms" }]],
  "reach.websocket": [["facts", "Checks", "set"]],
  "reach.webtransport": [["facts", "Checks", "set"]],
  "reach.login-item": [["facts", "Checks", "set"]],
  "reach.focus-stealing": [["hasFocus", "Page has focus", "boolean"], ["stolen", "Focus taken", "count"]],
  "reach.dialogs": [["count", "Dialogs shown", "count"], ["last", "Last dialog", "nominal", { options: ["none", "alert", "confirm", "prompt"] }]],
  "reach.popover-dialog": [["open", "Dialog open", "boolean"], ["toggles", "Toggles", "count"]],
  "reach.view-transitions": [["runs", "Transitions run", "count"], ["lastMs", "Last duration", "ratio", { unit: "ms" }]],
  "reach.text-fragments": [["supported", "Text fragments", "boolean"], ["opened", "Opened", "count"]],
  "reach.open-popup": [["opened", "Popups opened", "count"], ["blocked", "Blocked", "count"]],
  "reach.window-close": [["open", "Popup open", "boolean"], ["closedByPage", "Closed by page", "count"]],
  "reach.navigate-top": [["tried", "Navigations tried", "count"], ["blocked", "Blocked", "count"]],
  "reach.install-state": [["mode", "Running as", "nominal", { options: ["browser", "standalone", "minimal-ui", "fullscreen", "window-controls-overlay"] }], ["promptSeen", "Install prompt seen", "boolean"]],
  "reach.manifest-reader": [["present", "Manifest linked", "boolean"], ["members", "Members", "set"]],
  "reach.background-apis": [["swSupported", "Service worker", "boolean"], ["controlled", "Controlled", "boolean"]],
  "reach.web-share": [["files", "Share files", "boolean"]],
  "reach.idle-detection": [["userState", "User", "nominal", { options: ["active", "idle"] }], ["screenState", "Screen", "nominal", { options: ["unlocked", "locked"] }]],
  "reach.window-controls-overlay": [["Overlay visible", "Title bar overlay", "boolean"], ["Title bar height", "Title bar height", "ratio", { unit: "px" }]],
};

const AVAIL_OPTIONS = ["Missing", "Behind a flag", "Blocked", "Available"];

function toMetric([key, label, type, extra]: Spec, primary: boolean): Metric {
  return { key, label, type, ...extra, ...(primary ? { primary: true } : {}) };
}

/** Fill a data type on every metric and a primary headline on every scope. */
export function applyTypes(scopes: ScopeDef[]): ScopeDef[] {
  return scopes.map((s) => {
    if (s.reference) {
      return { ...s, metrics: [{ key: "detect", label: "Availability", type: "ordinal", options: AVAIL_OPTIONS, primary: true }] };
    }
    const spec = TYPES[s.id];
    const declared = (s.metrics || []).filter((m) => m.key !== "n");
    const byKey = new Map(declared.map((m) => [m.key, m]));
    const out: Metric[] = [];
    if (spec) {
      spec.forEach((sp, i) => {
        const had = byKey.get(sp[0]);
        out.push({ ...toMetric(sp, i === 0), ...(had ? { label: had.label, digits: had.digits ?? sp[3]?.digits, unit: had.unit ?? sp[3]?.unit } : {}) });
        byKey.delete(sp[0]);
      });
    }
    // Declared metrics the table does not mention keep their order, with a kind inferred from unit and key.
    for (const m of byKey.values()) out.push({ ...m, type: m.type || inferKind(m.key, 0, m.unit) });
    if (!out.length) out.push({ key: "@first", label: "Value", type: "nominal", primary: true });
    if (!out.some((m) => m.primary)) out[0] = { ...out[0], primary: true };
    const fieldCount = (s.metrics || []).find((m) => m.key === "n");
    if (fieldCount) out.push({ ...fieldCount, label: "Fields returned", type: "count" });
    return { ...s, metrics: out };
  });
}
