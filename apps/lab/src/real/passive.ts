import type { PassiveSignal } from "./types";

// Everything here is read silently, with no permission prompt.
// Every probe is wrapped so one failure never breaks the rest.

const nav = (): any => (typeof navigator !== "undefined" ? (navigator as any) : {});
const win = (): any => (typeof window !== "undefined" ? (window as any) : {});

function timeout<T>(p: Promise<T> | T, ms = 1500): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(undefined);
      },
    );
  });
}

function mq(q: string): boolean {
  try {
    return !!window.matchMedia && window.matchMedia(q).matches;
  } catch {
    return false;
  }
}

function pick(options: Array<[string, string]>, fallback = "No preference"): string {
  for (const [q, label] of options) if (mq(q)) return label;
  return fallback;
}

function s(id: string, label: string, value: unknown, group: string, detail?: string): PassiveSignal {
  const v = value === undefined || value === null || value === "" ? "Not available" : String(value);
  return detail ? { id, label, value: v, detail, group } : { id, label, value: v, group };
}

function yn(b: unknown): string {
  return b ? "Yes" : "No";
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await (crypto as any).subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type Probe = () => Promise<PassiveSignal[]> | PassiveSignal[];

// ---------- probes ----------

const probeUserAgent: Probe = () => {
  const n = nav();
  const ua: string = n.userAgent || "";
  return [
    s("web.device.user-agent", "Your browser identity string", ua, "Device", "The text your browser announces to every website."),
    s("web.device.navigator-platform", "Your platform", n.platform, "Device"),
    s("passive.vendor", "Browser vendor", n.vendor, "Device"),
    s("passive.product-sub", "Browser build date code", n.productSub, "Device"),
  ];
};

const probeClientHints: Probe = async () => {
  const n = nav();
  const out: PassiveSignal[] = [];
  const uad = n.userAgentData;
  if (!uad) {
    out.push(s("web.device.ua-client-hints-low", "Browser brands (client hints)", "Not supported by this browser", "Device"));
    return out;
  }
  const brands = (uad.brands || []).map((b: any) => `${b.brand} ${b.version}`).join(", ");
  out.push(s("web.device.ua-client-hints-low", "Browser brands (client hints)", brands, "Device", `Mobile device: ${yn(uad.mobile)}. Platform: ${uad.platform || "unknown"}.`));
  const high: any = await timeout(
    uad.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "uaFullVersion", "fullVersionList", "wow64", "formFactors"]),
    2000,
  );
  if (high) {
    out.push(s("web.device.ua-client-hints-high", "Exact browser version", high.uaFullVersion || (high.fullVersionList || []).map((b: any) => `${b.brand} ${b.version}`).join(", "), "Device", "Only given when the site asks for it, with no prompt."));
    out.push(s("web.device.ch-arch-bitness", "Processor type", [high.architecture, high.bitness ? `${high.bitness} bit` : ""].filter(Boolean).join(", "), "Device"));
    out.push(s("web.device.ch-model", "Device model", high.model, "Device", "Usually only filled in on Android phones."));
    out.push(s("web.device.ch-platform-version", "Operating system version", high.platformVersion, "Device"));
    out.push(s("web.device.ch-form-factors", "Device shape", Array.isArray(high.formFactors) ? high.formFactors.join(", ") : high.formFactors, "Device"));
  }
  return out;
};

const probeLanguage: Probe = () => {
  const n = nav();
  const langs: string[] = Array.from(n.languages || []);
  return [
    s("web.locale.language", "Your languages", langs.join(", ") || n.language, "Language and region", "In your order of preference."),
  ];
};

const probeTimezone: Probe = () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return [
    s("web.locale.timezone", "Your time zone", tz, "Language and region", "This usually points at your city or region."),
    s("passive.utc-offset", "Offset from UTC", `UTC${sign}${hh}:${mm}`, "Language and region"),
  ];
};

const probeIntl: Probe = () => {
  const d = new Date(2024, 11, 31, 23, 59, 58);
  const ro = Intl.DateTimeFormat().resolvedOptions() as any;
  return [
    s("web.locale.intl-formats", "How your device writes numbers and dates", `${new Intl.NumberFormat().format(1234567.89)} | ${d.toLocaleDateString()} | ${d.toLocaleTimeString()}`, "Language and region", `Locale: ${ro.locale}`),
    s("passive.calendar", "Calendar system", ro.calendar, "Language and region"),
    s("passive.numbering-system", "Number system", ro.numberingSystem, "Language and region"),
    s("passive.hour-cycle", "Clock style", ro.hourCycle ? (ro.hourCycle === "h11" || ro.hourCycle === "h12" ? "12 hour" : "24 hour") : undefined, "Language and region"),
  ];
};

const probePrivacyFlags: Probe = () => {
  const n = nav();
  const dnt = n.doNotTrack ?? win().doNotTrack ?? n.msDoNotTrack;
  const dntText = dnt === "1" || dnt === "yes" ? "On (asks sites not to track)" : dnt === "0" || dnt === "no" ? "Off" : "Not set";
  return [
    s("web.privacy.do-not-track", "Do Not Track", dntText, "Privacy"),
    s("web.xsite.global-privacy-control", "Global Privacy Control", n.globalPrivacyControl === undefined ? "Not supported by this browser" : n.globalPrivacyControl ? "On (opted out of sale and sharing)" : "Off", "Privacy"),
    s("web.storage.cookies-first-party", "Cookies allowed", yn(n.cookieEnabled), "Privacy"),
  ];
};

const probeScreen: Probe = () => {
  const sc = screen as any;
  const w = win();
  return [
    s("web.display.screen-size", "Your screen size", `${sc.width} x ${sc.height} pixels`, "Screen", `Usable area: ${sc.availWidth} x ${sc.availHeight} pixels`),
    s("passive.screen-available", "Usable screen area", `${sc.availWidth} x ${sc.availHeight} pixels`, "Screen"),
    s("web.display.color-depth", "Colour depth", `${sc.colorDepth} bit`, "Screen"),
    s("web.display.device-pixel-ratio", "Pixel density", `${w.devicePixelRatio}x`, "Screen"),
    s("web.display.window-sizes", "Browser window size", `${w.innerWidth} x ${w.innerHeight} pixels`, "Screen", `Outer window: ${w.outerWidth} x ${w.outerHeight}`),
    s("web.display.screen-orientation", "Screen orientation", (sc.orientation && sc.orientation.type) || (w.innerWidth >= w.innerHeight ? "landscape" : "portrait"), "Screen", sc.orientation ? `Angle: ${sc.orientation.angle} degrees` : undefined),
    s("web.device.touch-support", "Touch points", `${nav().maxTouchPoints ?? 0}`, "Screen", `Touch events present: ${yn("ontouchstart" in w)}`),
  ];
};

const probeMedia: Probe = () => {
  const scheme = pick([["(prefers-color-scheme: dark)", "Dark"], ["(prefers-color-scheme: light)", "Light"]]);
  const motion = pick([["(prefers-reduced-motion: reduce)", "Reduce motion"]], "No preference");
  const contrast = pick([["(prefers-contrast: more)", "More contrast"], ["(prefers-contrast: less)", "Less contrast"], ["(prefers-contrast: custom)", "Custom"]], "No preference");
  const forced = mq("(forced-colors: active)") ? "Active" : "Off";
  const gamut = pick([["(color-gamut: rec2020)", "Rec 2020 (very wide)"], ["(color-gamut: p3)", "Display P3 (wide)"], ["(color-gamut: srgb)", "sRGB (standard)"]], "Unknown");
  const hdr = pick([["(dynamic-range: high)", "HDR capable"], ["(dynamic-range: standard)", "Standard range"]], "Unknown");
  const pointer = pick([["(pointer: fine)", "Precise (mouse or trackpad)"], ["(pointer: coarse)", "Coarse (finger)"]], "None");
  const anyPointer = pick([["(any-pointer: fine)", "Has a precise pointer"], ["(any-pointer: coarse)", "Touch only"]], "None");
  const hover = pick([["(hover: hover)", "Can hover"], ["(hover: none)", "Cannot hover"]], "Unknown");
  const displayMode = pick([["(display-mode: standalone)", "Installed app"], ["(display-mode: fullscreen)", "Fullscreen"], ["(display-mode: minimal-ui)", "Minimal"], ["(display-mode: browser)", "Normal browser tab"]], "Unknown");
  const out: PassiveSignal[] = [
    s("web.display.prefers-color-scheme", "Light or dark mode", scheme, "Accessibility and look"),
    s("web.display.prefers-reduced-motion", "Reduce motion setting", motion, "Accessibility and look"),
    s("web.display.prefers-contrast", "Contrast setting", contrast, "Accessibility and look"),
    s("web.display.forced-colors", "High contrast colours", forced, "Accessibility and look"),
    s("web.display.color-gamut", "Colour range of your screen", gamut, "Screen"),
    s("web.display.dynamic-range", "HDR support", hdr, "Screen"),
    s("web.display.pointer-hover", "Pointer type", pointer, "Input", `${anyPointer}. ${hover}.`),
    s("web.display.display-mode", "How this page is shown", displayMode, "Screen"),
    s("web.display.prefers-reduced-data", "Data saver preference", mq("(prefers-reduced-data: reduce)") ? "Reduce data" : "No preference", "Accessibility and look"),
    s("web.display.inverted-colors", "Inverted colours", mq("(inverted-colors: inverted)") ? "On" : "Off", "Accessibility and look"),
  ];
  return out;
};

const probeCpu: Probe = () => {
  const n = nav();
  return [
    s("web.device.hardware-concurrency", "CPU cores", n.hardwareConcurrency, "Hardware", "Number of logical processors."),
    s("web.device.device-memory", "Device memory", n.deviceMemory !== undefined ? `${n.deviceMemory} GB (rounded)` : "Not shared by this browser", "Hardware"),
  ];
};

const probeNetwork: Probe = () => {
  const n = nav();
  const c = n.connection || n.mozConnection || n.webkitConnection;
  const out: PassiveSignal[] = [s("web.network.online-offline", "Online right now", yn(n.onLine), "Network")];
  if (c) {
    out.push(
      s("web.network.network-information", "Connection quality", c.effectiveType, "Network", `Download about ${c.downlink} Mbps, round trip ${c.rtt} ms, data saver ${c.saveData ? "on" : "off"}${c.type ? `, link type ${c.type}` : ""}.`),
      s("passive.net-downlink", "Estimated download speed", c.downlink !== undefined ? `${c.downlink} Mbps` : undefined, "Network"),
      s("passive.net-rtt", "Estimated round trip time", c.rtt !== undefined ? `${c.rtt} ms` : undefined, "Network"),
      s("passive.net-savedata", "Data saver", yn(c.saveData), "Network"),
    );
  } else {
    out.push(s("web.network.network-information", "Connection quality", "Not shared by this browser", "Network"));
  }
  return out;
};

const probeBattery: Probe = async () => {
  const n = nav();
  if (!n.getBattery) return [s("web.device.battery", "Battery level", "Not shared by this browser", "Hardware")];
  const b: any = await timeout(n.getBattery(), 1500);
  if (!b) return [s("web.device.battery", "Battery level", "Not available", "Hardware")];
  return [
    s("web.device.battery", "Battery level", `${Math.round(b.level * 100)}%`, "Hardware", `${b.charging ? "Charging" : "Not charging"}${isFinite(b.dischargingTime) ? `, about ${Math.round(b.dischargingTime / 60)} minutes left` : ""}`),
  ];
};

const probeStorage: Probe = async () => {
  const st: any = nav().storage;
  const out: PassiveSignal[] = [];
  if (!st) return [s("web.device.storage-estimate", "Storage space for this site", "Not available", "Storage")];
  const est: any = st.estimate ? await timeout(st.estimate(), 1500) : undefined;
  if (est) {
    const mb = (x: number) => `${(x / 1048576).toFixed(0)} MB`;
    out.push(s("web.device.storage-estimate", "Storage space this site could use", est.quota ? (est.quota >= 1073741824 ? `${(est.quota / 1073741824).toFixed(1)} GB` : mb(est.quota)) : undefined, "Storage", `Used so far: ${mb(est.usage || 0)}. The quota hints at how big your disk is.`));
  }
  const persisted = st.persisted ? await timeout(st.persisted(), 1500) : undefined;
  out.push(s("web.storage.persistent-storage", "Storage protected from clean up", persisted === undefined ? undefined : persisted ? "Yes" : "No", "Storage"));
  return out;
};

const probeCanvas: Probe = async () => {
  const c = document.createElement("canvas");
  c.width = 280;
  c.height = 60;
  const g = c.getContext("2d");
  if (!g) return [s("web.render.canvas-2d-fingerprint", "Canvas fingerprint", "Canvas blocked", "Fingerprints")];
  g.textBaseline = "alphabetic";
  g.fillStyle = "#f60";
  g.fillRect(125, 1, 62, 20);
  g.fillStyle = "#069";
  g.font = "14px 'Arial'";
  g.fillText("Platform.Ontology cwm fjordbank glyphs vext quiz", 2, 15);
  g.fillStyle = "rgba(102, 204, 0, 0.7)";
  g.font = "18px Times New Roman";
  g.fillText("Sphinx of black quartz, judge my vow", 4, 45);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "rgb(255,0,255)";
  g.beginPath();
  g.arc(50, 30, 20, 0, Math.PI * 2, true);
  g.closePath();
  g.fill();
  g.fillStyle = "rgb(0,255,255)";
  g.beginPath();
  g.arc(80, 30, 20, 0, Math.PI * 2, true);
  g.closePath();
  g.fill();
  const url = c.toDataURL();
  const hash = await sha256Hex(url);
  return [s("web.render.canvas-2d-fingerprint", "Canvas fingerprint", hash.slice(0, 16), "Fingerprints", "A short code made by drawing hidden text and shapes. Tiny differences in your graphics setup change it.")];
};

const probeWebGL: Probe = () => {
  const c = document.createElement("canvas");
  const gl: any = c.getContext("webgl") || c.getContext("experimental-webgl");
  if (!gl) return [s("web.device.webgl-renderer", "Graphics card", "WebGL not available", "Hardware")];
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
  const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return [
    s("web.device.webgl-renderer", "Graphics card", renderer, "Hardware", ext ? "Read from the graphics debug info, no prompt." : "This browser hides the exact model."),
    s("passive.webgl-vendor", "Graphics card maker", vendor, "Hardware"),
    s("web.render.webgl", "Largest texture size", gl.getParameter(gl.MAX_TEXTURE_SIZE), "Hardware", `Max renderbuffer ${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}, WebGL version ${gl.getParameter(gl.VERSION)}`),
  ];
};

const probeAudio: Probe = () => {
  const AC = win().AudioContext || win().webkitAudioContext;
  if (!AC) return [s("web.rendering.audio-base-latency", "Audio delay", "Not available", "Hardware")];
  let ctx: any;
  try {
    ctx = new AC();
    const out = [
      s("web.render.audio-context-properties", "Audio sample rate", `${ctx.sampleRate} Hz`, "Hardware"),
      s("web.rendering.audio-base-latency", "Audio delay", ctx.baseLatency !== undefined ? `${(ctx.baseLatency * 1000).toFixed(2)} ms` : "Not shared", "Hardware"),
      s("passive.audio-channels", "Speaker channels", ctx.destination ? ctx.destination.maxChannelCount : undefined, "Hardware"),
    ];
    return out;
  } finally {
    try {
      ctx && ctx.close && ctx.close();
    } catch {
      /* ignore */
    }
  }
};

const FONTS = [
  "Arial", "Helvetica", "Times New Roman", "Courier New", "Verdana", "Georgia", "Tahoma", "Trebuchet MS",
  "Impact", "Comic Sans MS", "Palatino", "Garamond", "Calibri", "Cambria", "Segoe UI", "Consolas",
  "Menlo", "Monaco", "Roboto", "Futura", "Gill Sans", "Optima", "Lucida Grande", "Ubuntu", "San Francisco",
];

const probeFonts: Probe = () => {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  if (!g) return [s("web.device.installed-fonts", "Installed fonts", "Canvas blocked", "Fingerprints")];
  const text = "mmmmmmmmmmlliWWQ@#0123 fjordbank";
  const bases = ["monospace", "serif", "sans-serif"];
  const baseW: Record<string, number> = {};
  for (const b of bases) {
    g.font = `72px ${b}`;
    baseW[b] = g.measureText(text).width;
  }
  const found: string[] = [];
  for (const f of FONTS) {
    const hit = bases.some((b) => {
      g.font = `72px '${f}', ${b}`;
      return g.measureText(text).width !== baseW[b];
    });
    if (hit) found.push(f);
  }
  return [s("web.device.installed-fonts", "Fonts found on your device", `${found.length} of ${FONTS.length} tested`, "Fingerprints", found.length ? found.join(", ") : "None of the tested fonts matched.")];
};

const probeDevices: Probe = async () => {
  const md = nav().mediaDevices;
  if (!md || !md.enumerateDevices) return [s("web.device.mediadevices-count", "Cameras and microphones", "Not available", "Hardware")];
  const list: MediaDeviceInfo[] | undefined = await timeout(md.enumerateDevices(), 1500);
  if (!list) return [s("web.device.mediadevices-count", "Cameras and microphones", "Not available", "Hardware")];
  const count = (k: string) => list.filter((d) => d.kind === k).length;
  const v = count("videoinput");
  const a = count("audioinput");
  const o = count("audiooutput");
  return [s("web.device.mediadevices-count", "Cameras and microphones", `${v} camera${v === 1 ? "" : "s"}, ${a} microphone${a === 1 ? "" : "s"}, ${o} speaker${o === 1 ? "" : "s"}`, "Hardware", "Counts only. Names stay hidden until you allow access.")];
};

const PERMS = [
  "geolocation", "notifications", "camera", "microphone", "clipboard-read", "clipboard-write", "persistent-storage",
  "midi", "accelerometer", "gyroscope", "magnetometer", "ambient-light-sensor", "background-sync", "screen-wake-lock",
  "push", "idle-detection", "local-fonts", "window-management", "storage-access", "payment-handler",
];

const probePermissions: Probe = async () => {
  const p = nav().permissions;
  if (!p || !p.query) return [s("web.meta.permissions-api", "Permission states", "Not available", "Permissions")];
  const states: Array<[string, string]> = [];
  await Promise.all(
    PERMS.map(async (name) => {
      const r: any = await timeout(p.query({ name }), 1200);
      if (r && r.state) states.push([name, r.state]);
    }),
  );
  states.sort((a, b) => PERMS.indexOf(a[0]) - PERMS.indexOf(b[0]));
  const word = (st: string) => (st === "granted" ? "Allowed" : st === "denied" ? "Blocked" : "Will ask");
  const out: PassiveSignal[] = [];
  const granted = states.filter((x) => x[1] === "granted").length;
  const denied = states.filter((x) => x[1] === "denied").length;
  const prompt = states.filter((x) => x[1] === "prompt").length;
  out.push(s("web.meta.permissions-api", "Permission states", `${states.length} checked: ${granted} allowed, ${denied} blocked, ${prompt} will ask`, "Permissions", "Any site can read these states without asking."));
  for (const [name, st] of states) out.push(s(`passive.permission.${name}`, `Permission: ${name.replace(/-/g, " ")}`, word(st), "Permissions"));
  return out;
};

const probePage: Probe = () => {
  let ref = "";
  try {
    ref = document.referrer;
  } catch {
    /* ignore */
  }
  return [
    s("web.xsite.document-referrer", "Where you came from", ref || "Nothing (typed or hidden)", "This visit"),
    s("passive.history-length", "Pages in this tab's history", history.length, "This visit"),
    s("passive.page-url", "This page address", location.href, "This visit"),
  ];
};

const probeTiming: Probe = () => {
  const nt: any = (performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || undefined;
  if (!nt) return [s("web.perf.navigation-resource-timing", "Page load timing", "Not available", "This visit")];
  const ttfb = Math.round(nt.responseStart - nt.startTime);
  const dcl = Math.round(nt.domContentLoadedEventEnd - nt.startTime);
  return [
    s("web.perf.navigation-resource-timing", "Time to first byte", `${ttfb} ms`, "This visit", `Page ready after ${dcl} ms. Connection type: ${nt.nextHopProtocol || "unknown"}.`),
    s("passive.dom-load", "Page ready time", `${dcl} ms`, "This visit"),
  ];
};

const probeMisc: Probe = () => {
  const n = nav();
  const out: PassiveSignal[] = [
    s("web.device.pdf-viewer-enabled", "Built in PDF viewer", n.pdfViewerEnabled === undefined ? "Unknown" : yn(n.pdfViewerEnabled), "Device"),
    s("web.device.webdriver", "Automation flag", n.webdriver ? "Yes (looks like a robot)" : "No (looks like a person)", "Device"),
  ];
  return out;
};

const probeKeyboard: Probe = async () => {
  const kb = nav().keyboard;
  if (!kb || !kb.getLayoutMap) return [s("web.input.keyboard-layout-map", "Keyboard layout", "Not shared by this browser", "Input")];
  const map: any = await timeout(kb.getLayoutMap(), 1500);
  if (!map) return [s("web.input.keyboard-layout-map", "Keyboard layout", "Not available", "Input")];
  const sample = ["KeyQ", "KeyW", "KeyY", "KeyZ"].map((k) => map.get(k) || "?").join(" ");
  const layout = map.get("KeyQ") === "a" ? "AZERTY style" : map.get("KeyY") === "z" ? "QWERTZ style" : map.get("KeyQ") === "q" ? "QWERTY style" : "Other";
  return [s("web.input.keyboard-layout-map", "Keyboard layout", layout, "Input", `Keys Q W Y Z produce: ${sample}`)];
};

const probeSecure: Probe = () => [
  s("passive.secure-context", "Secure page (https)", yn(win().isSecureContext), "This visit"),
  s("passive.cross-origin-isolated", "Cross origin isolated", yn(win().crossOriginIsolated), "This visit"),
];

const PROBES: Array<[string, Probe]> = [
  ["ua", probeUserAgent],
  ["hints", probeClientHints],
  ["lang", probeLanguage],
  ["tz", probeTimezone],
  ["intl", probeIntl],
  ["privacy", probePrivacyFlags],
  ["screen", probeScreen],
  ["media", probeMedia],
  ["cpu", probeCpu],
  ["net", probeNetwork],
  ["battery", probeBattery],
  ["storage", probeStorage],
  ["canvas", probeCanvas],
  ["webgl", probeWebGL],
  ["audio", probeAudio],
  ["fonts", probeFonts],
  ["devices", probeDevices],
  ["perms", probePermissions],
  ["page", probePage],
  ["timing", probeTiming],
  ["misc", probeMisc],
  ["kb", probeKeyboard],
  ["secure", probeSecure],
];

export async function collectPassive(): Promise<PassiveSignal[]> {
  const results = await Promise.all(
    PROBES.map(async ([, fn]) => {
      try {
        const r = await timeout(Promise.resolve().then(fn), 4000);
        return r || [];
      } catch {
        return [] as PassiveSignal[];
      }
    }),
  );
  const seen = new Set<string>();
  const out: PassiveSignal[] = [];
  for (const list of results)
    for (const sig of list) {
      if (seen.has(sig.id)) continue;
      seen.add(sig.id);
      out.push(sig);
    }
  return out;
}
