import type { AtlasNode } from "../core/types";
import { supportOf, type Profile } from "./profile";

// Is an atlas entry available in this browser right now? Three checks, in order:
// 1. feature detection (a curated probe, else names pulled from the atlas `api` text),
// 2. navigator.permissions.query for its permission, when it has one,
// 3. release state: stable, behind a flag, origin trial, install only, or not exposed at all.

export type Detect = "present" | "absent" | "unknown";
export type Release = "stable" | "partial" | "flag" | "origin-trial" | "install" | "enterprise" | "restricted" | "no" | "not-exposed";
export type Availability = {
  detect: Detect;
  /** What was checked, e.g. "window.LanguageModel". */
  via: string;
  /** Permissions API state, or "n/a" when there is nothing to query. */
  permission: string;
  permissionName?: string;
  release: Release;
  /** One plain sentence: what this means for the visitor right now. */
  verdict: string;
  /** Why it cannot run as a live call here, when that is the case. */
  why?: string;
};

const w = (): any => window as any;
const n = (): any => navigator as any;
const has = (path: string): boolean => {
  try {
    let o: any = window;
    for (const k of path.split(".")) { if (o == null || !(k in Object(o))) return false; o = o[k]; }
    return o !== undefined;
  } catch { return false; }
};
const el = (tag: string) => { try { const e = document.createElement(tag); return !(e instanceof HTMLUnknownElement) && e.constructor !== HTMLElement; } catch { return false; } };
const supportsScript = (t: string) => { try { return !!(HTMLScriptElement as any).supports?.(t); } catch { return false; } };
const entryType = (t: string) => { try { return (PerformanceObserver as any).supportedEntryTypes?.includes(t) ?? false; } catch { return false; } };

/** Curated probes for entries whose `api` text does not name a detectable global. */
const PROBES: Record<string, [string, () => boolean]> = {
  "web.camera.camera-ptz": ["getSupportedConstraints().pan", () => !!n().mediaDevices?.getSupportedConstraints?.().pan],
  "web.camera.captured-surface-control": ["CaptureController.prototype.sendWheel", () => has("CaptureController") && "sendWheel" in w().CaptureController.prototype],
  "web.camera.region-element-capture": ["CropTarget / RestrictionTarget", () => has("CropTarget") || has("RestrictionTarget")],
  "web.camera.usermedia-element": ["<usermedia> element", () => el("usermedia") || el("permission")],
  "web.location.geolocation-element": ["<geolocation> element", () => el("geolocation") || el("permission")],
  "web.xsite.fenced-frames": ["HTMLFencedFrameElement", () => has("HTMLFencedFrameElement")],
  "web.actions.fenced-frames": ["HTMLFencedFrameElement", () => has("HTMLFencedFrameElement")],
  "web.xsite.fetchlater": ["window.fetchLater", () => has("fetchLater")],
  "web.xsite.private-state-tokens": ["document.hasPrivateToken", () => "hasPrivateToken" in document],
  "web.identity.private-state-tokens": ["document.hasPrivateToken", () => "hasPrivateToken" in document],
  "web.xsite.speculation-rules-prefetch": ["HTMLScriptElement.supports('speculationrules')", () => supportsScript("speculationrules")],
  "web.xsite.third-party-cookies-status": ["document.hasStorageAccess", () => "hasStorageAccess" in document],
  "web.storage.top-level-storage-access": ["document.requestStorageAccessFor", () => "requestStorageAccessFor" in document],
  "web.device.extension-probing": ["window.chrome", () => has("chrome")],
  "web.tracking.linkedin-extension-probe": ["window.chrome", () => has("chrome")],
  "web.auth.dbsc": ["no script API (HTTP headers only)", () => false],
  "web.net.client-hints": ["navigator.userAgentData", () => has("navigator.userAgentData")],
  "web.net.sec-ch-ua": ["navigator.userAgentData", () => has("navigator.userAgentData")],
  "web.network.device-client-hints": ["navigator.deviceMemory", () => "deviceMemory" in navigator],
  "web.network.ect-client-hints": ["navigator.connection.effectiveType", () => !!n().connection?.effectiveType],
  "web.network.save-data-header": ["navigator.connection.saveData", () => !!n().connection && "saveData" in n().connection],
  "web.network.direct-sockets": ["TCPSocket", () => has("TCPSocket")],
  "web.notify.background-fetch": ["BackgroundFetchManager", () => has("BackgroundFetchManager")],
  "web.notify.background-sync": ["SyncManager", () => has("SyncManager")],
  "web.notify.periodic-background-sync": ["PeriodicSyncManager", () => has("PeriodicSyncManager")],
  "web.ai.gemini-nano-requirements": ["LanguageModel / Summarizer / Translator", () => has("LanguageModel") || has("Summarizer") || has("Translator")],
  "web.ai.prompt-api": ["window.LanguageModel", () => has("LanguageModel")],
  "web.ai.summarizer-api": ["window.Summarizer", () => has("Summarizer")],
  "web.ai.translator-api": ["window.Translator", () => has("Translator")],
  "web.ai.language-detector": ["window.LanguageDetector", () => has("LanguageDetector")],
  "web.os.file-handling": ["window.launchQueue", () => has("launchQueue")],
  "web.os.launch-handler": ["window.LaunchParams", () => has("LaunchParams")],
  "web.os.note-taking": ["manifest note_taking (no script API)", () => false],
  "web.os.protocol-handlers": ["navigator.registerProtocolHandler", () => "registerProtocolHandler" in navigator],
  "web.os.web-share-target": ["manifest share_target (no script API)", () => false],
  "web.os.window-controls-overlay": ["navigator.windowControlsOverlay", () => "windowControlsOverlay" in navigator],
  "web.payments.digital-goods": ["window.getDigitalGoodsService", () => has("getDigitalGoodsService")],
  "web.payments.payment-handler": ["PaymentManager", () => has("PaymentManager")],
  "web.payments.secure-payment-confirmation": ["PaymentRequest.isSecurePaymentConfirmationAvailable", () => has("PaymentRequest") && "isSecurePaymentConfirmationAvailable" in w().PaymentRequest],
  "web.contacts.webotp": ["OTPCredential", () => has("OTPCredential")],
  "web.perf.long-animation-frames": ["long-animation-frame entry type", () => entryType("long-animation-frame")],
  "web.perf.measure-user-agent-memory": ["performance.measureUserAgentSpecificMemory", () => "measureUserAgentSpecificMemory" in performance],
  "web.timing.page-lifecycle-bfcache": ["document.wasDiscarded", () => "wasDiscarded" in document],
  "web.input.edit-context": ["EditContext", () => has("EditContext")],
  "web.input.virtual-keyboard": ["navigator.virtualKeyboard", () => "virtualKeyboard" in navigator],
  "web.display.keyboard-lock": ["navigator.keyboard.lock", () => !!n().keyboard?.lock],
  "web.input.keyboard-lock": ["navigator.keyboard.lock", () => !!n().keyboard?.lock],
  "web.display.document-pip": ["window.documentPictureInPicture", () => has("documentPictureInPicture")],
  "web.storage.file-system-access": ["window.showOpenFilePicker", () => has("showOpenFilePicker")],
  "web.auth.fedcm": ["IdentityCredential", () => has("IdentityCredential")],
  "web.identity.fedcm": ["IdentityCredential", () => has("IdentityCredential")],
  "web.auth.password-credential-management": ["PasswordCredential", () => has("PasswordCredential")],
  "web.identity.credential-management": ["PasswordCredential", () => has("PasswordCredential")],
  "web.net.local-network-access": ["permission local-network-access", () => false],
};

/**
 * Pull a detectable name out of free text like "new PressureObserver(cb)" or "navigator.xr.isSessionSupported()".
 * `strong` means a miss really says the browser lacks it; a weak guess (a bare CamelCase word, which is often a
 * vendor or protocol name) or a non standard window global only counts when it is found.
 */
function guess(api: string): { name: string; strong: boolean; member?: [string, string] } | null {
  const paths = api.match(/\b(?:navigator|window|document|performance|screen)(?:\.[A-Za-z_$][\w$]*)+/g) || [];
  for (const p of paths) {
    const parts = p.split(".").slice(0, 3);
    // window.__tcfapi or window.dfp are third party script globals, not browser features.
    const vendor = parts[0] === "window" && /^(?:_|[a-z]+$)/.test(parts[1]);
    return { name: parts.join("."), strong: !vendor };
  }
  const ns = api.match(/\b(?:new\s+)?([A-Z][A-Za-z0-9]*)\.(?:prototype\.)?([A-Za-z_$][\w$]*)/);
  if (ns) return { name: ns[1] + "." + ns[2], strong: has(ns[1]), member: [ns[1], ns[2]] };
  const ctor = api.match(/\bnew\s+([A-Z][A-Za-z0-9]+)/);
  if (ctor) return { name: ctor[1], strong: true };
  const word = api.match(/\b([A-Z][a-z]+(?:[A-Z][a-z0-9]+)+)\b/);
  return word ? { name: word[1], strong: false } : null;
}

function detectNode(node: AtlasNode): [Detect, string] {
  const probe = PROBES[node.i];
  if (probe) {
    try { return [probe[1]() ? "present" : (/no script API|permission /.test(probe[0]) ? "unknown" : "absent"), probe[0]]; } catch { return ["unknown", probe[0]]; }
  }
  if (!node.api) return ["unknown", "no API named"];
  if (/^\s*(manifest|Accept-CH|Sec-|Set-Cookie|Permissions-Policy|HTTP|<meta)/i.test(node.api)) return ["unknown", "set by the server or manifest"];
  const g = guess(node.api);
  if (!g) return ["unknown", "nothing a script can test"];
  const path = /^(navigator|document|performance|screen)\./.test(g.name) ? g.name : g.name.replace(/^window\./, "");
  if (g.member) {
    // Intl.DateTimeFormat is static; KeyboardEvent.key lives on the prototype. Either counts.
    const root = (window as any)[g.member[0]];
    const m = g.member[1];
    if (root && (m in root || (root.prototype && m in root.prototype))) return ["present", g.name];
  } else if (has(path)) return ["present", g.name];
  return g.strong ? ["absent", g.name] : ["unknown", g.name + " (not a browser API name, so no script test)"];
}

/** Map the atlas permission text to a Permissions API name. */
const PERM: [RegExp, string][] = [
  [/pan.?tilt|ptz/i, "camera"], [/camera/i, "camera"], [/micro/i, "microphone"], [/geoloc|location/i, "geolocation"],
  [/notif/i, "notifications"], [/push/i, "push"], [/clipboard-read/i, "clipboard-read"], [/clipboard/i, "clipboard-write"],
  [/periodic/i, "periodic-background-sync"], [/background-sync|background sync/i, "background-sync"], [/background-fetch/i, "background-fetch"],
  [/storage-access|storage access/i, "storage-access"], [/top-level-storage/i, "top-level-storage-access"], [/local-network/i, "local-network-access"],
  [/window-management|window management/i, "window-management"], [/local-fonts|local fonts/i, "local-fonts"], [/idle/i, "idle-detection"],
  [/midi/i, "midi"], [/screen-wake|wake lock/i, "screen-wake-lock"], [/accelerometer/i, "accelerometer"], [/gyroscope/i, "gyroscope"],
  [/magnetometer/i, "magnetometer"], [/ambient/i, "ambient-light-sensor"], [/persistent-storage|persist/i, "persistent-storage"],
  [/identity-credentials|fedcm/i, "identity-credentials-get"], [/keyboard-lock/i, "keyboard-lock"], [/pointer-lock/i, "pointer-lock"],
  [/display-capture|screen capture/i, "display-capture"], [/captured-surface/i, "captured-surface-control"], [/speaker-selection/i, "speaker-selection"],
  [/nfc/i, "nfc"], [/payment-handler/i, "payment-handler"], [/system-wake/i, "system-wake-lock"],
];
const NAME_BY_ID: Record<string, string> = {
  "web.net.local-network-access": "local-network-access",
  "web.camera.captured-surface-control": "captured-surface-control",
  "web.notify.periodic-background-sync": "periodic-background-sync",
  "web.notify.background-sync": "background-sync",
  "web.notify.background-fetch": "background-fetch",
  "web.auth.fedcm": "identity-credentials-get",
  "web.identity.fedcm": "identity-credentials-get",
  "web.display.keyboard-lock": "keyboard-lock",
  "web.input.keyboard-lock": "keyboard-lock",
  "web.storage.top-level-storage-access": "top-level-storage-access",
};

export function permissionName(node: AtlasNode): string | undefined {
  if (NAME_BY_ID[node.i]) return NAME_BY_ID[node.i];
  if (!node.perm) return undefined;
  return PERM.find(([re]) => re.test(node.perm!))?.[1];
}

async function queryPerm(name?: string): Promise<string> {
  if (!name) return "n/a";
  try {
    const q = n().permissions?.query;
    if (!q) return "no Permissions API";
    const desc: any = name === "camera" && false ? { name, panTiltZoom: true } : { name };
    const r = await n().permissions.query(desc);
    return r.state;
  } catch {
    return "not queryable";
  }
}

export function releaseOf(node: AtlasNode, profile: Profile): Release {
  if (node.k === "not-exposed" || node.gr === "not-exposed") return "not-exposed";
  const c = supportOf(node.sup, profile.column);
  if (c === "n" || c === "u") return "no";
  if (c === "f") return "flag";
  if (c === "r") return "restricted";
  if (node.gr === "origin-trial") return "origin-trial";
  if (node.gr === "install") return "install";
  if (node.gr === "enterprise") return "enterprise";
  return c === "p" ? "partial" : "stable";
}

export const RELEASE_LABEL: Record<Release, string> = {
  stable: "Shipped", partial: "Partly shipped", flag: "Behind a flag", "origin-trial": "Origin trial", install: "Installed apps only",
  enterprise: "Managed devices only", restricted: "Restricted by default", no: "Not in this browser", "not-exposed": "Never exposed to pages",
};

/** Plain reasons a reference entry cannot run as a live call in this console. */
const WHY: Record<string, string> = {
  "web.auth.dbsc": "It runs in HTTP headers between a server and the browser. A page script has nothing to call.",
  "web.net.client-hints": "The hints travel as request headers the page cannot read. The script equivalents run under Client Hints in the live list.",
  "web.network.device-client-hints": "These are request headers that only the server sees.",
  "web.network.ect-client-hints": "These are request headers that only the server sees. navigator.connection shows the same numbers.",
  "web.network.save-data-header": "This is a request header that only the server sees.",
  "web.network.direct-sockets": "Only Isolated Web Apps get raw sockets. A normal https page never does.",
  "web.os.note-taking": "Declared in an installed app's manifest, so there is nothing to call from a page.",
  "web.os.web-share-target": "Declared in an installed app's manifest. The OS share sheet sends data to the app, not to this page.",
  "web.os.file-handling": "Only an installed app that declares file_handlers receives files through launchQueue.",
  "web.os.launch-handler": "Only takes effect for an installed app launched from the OS.",
  "web.payments.digital-goods": "Only works inside a Trusted Web Activity distributed through Google Play.",
  "web.payments.payment-handler": "Needs a service worker that acts as a payment app. This console registers none.",
  "web.notify.background-fetch": "Needs a service worker registration. This console does not install one, so it reports availability only.",
  "web.notify.background-sync": "Needs a service worker registration. This console does not install one, so it reports availability only.",
  "web.notify.periodic-background-sync": "Needs an installed app with a service worker and enough site engagement.",
  "web.xsite.private-state-tokens": "Needs a registered token issuer. Without one there is nothing to redeem.",
  "web.identity.private-state-tokens": "Needs a registered token issuer. Without one there is nothing to redeem.",
  "web.auth.fedcm": "Needs an identity provider's config file and client id. Calling it without one only produces an error.",
  "web.identity.fedcm": "Needs an identity provider's config file and client id. Calling it without one only produces an error.",
  "web.contacts.webotp": "Needs an SMS sent to this phone that names this site. Nothing can arrive in a demo.",
  "web.xsite.fenced-frames": "Only ad auctions (Protected Audience) can fill a fenced frame.",
  "web.actions.fenced-frames": "Only ad auctions (Protected Audience) can fill a fenced frame.",
  "web.storage.top-level-storage-access": "Only a site in the same Related Website Set as this one may ask.",
  "web.device.extension-probing": "Probing needs a list of extension ids and their public files. The console shows the technique but does not probe.",
  "web.tracking.linkedin-extension-probe": "Probing needs a list of extension ids and their public files. The console shows the technique but does not probe.",
  "web.os.protocol-handlers": "Registering a handler changes a setting in your browser, so the console only checks that it is offered.",
};

export async function probe(node: AtlasNode, profile: Profile): Promise<Availability> {
  const [detect, via] = detectNode(node);
  const permName = permissionName(node);
  const permission = await queryPerm(permName);
  const release = releaseOf(node, profile);
  let verdict: string;
  if (release === "not-exposed") verdict = "No browser hands this to a web page. Only native apps or extensions can see it.";
  else if (detect === "present" && permission === "denied") verdict = "This browser has it, but you have blocked it for this site.";
  else if (detect === "present" && permission === "granted") verdict = "Available now and already allowed for this site.";
  else if (detect === "present" && (release === "install")) verdict = "The API exists here, but it only acts for an installed app.";
  else if (detect === "present") verdict = permission === "prompt" ? "Available now. The browser will ask first." : "Available now in this browser.";
  else if (detect === "absent" && release === "flag") verdict = "Behind a flag in this browser. Turn it on in chrome://flags to try it.";
  else if (detect === "absent" && release === "origin-trial") verdict = "Only in an origin trial. Sites must register a trial token to use it.";
  else if (detect === "absent" && (release === "stable" || release === "partial")) verdict = "The atlas lists it for this browser, but this copy does not expose it. It may need a newer version, a flag, a policy or an installed app.";
  else if (detect === "absent") verdict = "Not in this browser.";
  else verdict = release === "no" ? "Not in this browser." : "Nothing for a script to test. It works through headers, a manifest or the OS.";
  const why = WHY[node.i] || (node.gr === "install" ? "Only an installed web app can use it." : release === "not-exposed" ? "It is outside what any web page can reach." : undefined);
  return { detect, via, permission, permissionName: permName, release, verdict, why };
}

/** Which browsers support an entry, for the "exclusive here" ranking. Columns: chrome, edge, firefox, safari. */
export function exclusivity(node: AtlasNode, col: number): "only" | "best" | "shared" | "missing" {
  const ok = (c: string) => c === "y" || c === "p";
  const me = ok(node.sup[col] || "n");
  if (!me) return "missing";
  // Compare engines, not brands: Chrome, Edge, Android Chrome and Samsung share Blink.
  const blink = [0, 1, 5, 6], gecko = [2], webkit = [3, 4];
  const fam = blink.includes(col) ? blink : gecko.includes(col) ? gecko : webkit;
  const others = [blink, gecko, webkit].filter((f) => f !== fam);
  const otherOk = others.filter((f) => f.some((i) => ok(node.sup[i] || "n"))).length;
  if (otherOk === 0) {
    // Edge only (not in Chrome) counts as exclusive to Edge too.
    return "only";
  }
  return otherOk === 1 ? "best" : "shared";
}
