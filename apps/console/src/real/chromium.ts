import { add, f, num, unsupported, fail, stopStream, sleep } from "./handlers";
import { realHandlers } from "./handlers";
import type { Field, RealResult } from "./types";

// Chromium only abilities that a normal https page can really call. Each handler makes the real
// call, needs a click where the browser demands one, and returns a plain explanation when the
// browser does not have it. Nothing is sent anywhere and nothing persistent is changed.

const nav = (): any => navigator as any;
const win = (): any => window as any;

/** Register only ids that no earlier handler already covers. */
function addNew(ids: string[], label: string, needsGesture: boolean, run: () => Promise<RealResult>, stop?: () => void) {
  const free = ids.filter((id) => !Object.prototype.hasOwnProperty.call(realHandlers, id));
  if (free.length) add(free, label, needsGesture, run, stop);
}

// ---------------------------------------------------------------- Built in AI (Gemini Nano)

const SAMPLE =
  "The Platform Ontology console lists every capability a web page can reach in your browser. " +
  "Some abilities run silently, some ask for permission, and some need a click before the browser allows them. " +
  "Chrome ships several of them only in Chromium, such as on-device AI that summarizes or translates text without a server.";

const LANG = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

async function availabilityOf(name: string, opts?: unknown): Promise<string> {
  const C = win()[name];
  if (!C) return "missing";
  try {
    return String(await C.availability(opts));
  } catch {
    try { return String(await C.availability()); } catch (e: any) { return "error: " + (e?.name || "unknown"); }
  }
}

const MEANING: Record<string, string> = {
  available: "The model is on this device, so the call ran.",
  downloadable: "The browser supports it but the model is not downloaded yet. The console does not start the large download for you.",
  downloading: "The model is downloading now. Try again when it finishes (chrome://on-device-internals shows progress).",
  unavailable: "This device does not meet the model's requirements (storage, GPU or RAM), or a policy turned it off.",
  missing: "This browser does not expose the API. In Chrome it may need a newer version or a flag.",
};

async function aiCall(
  name: string, label: string, availOpts: unknown, createOpts: unknown,
  use: (inst: any) => Promise<Field[]>,
): Promise<RealResult> {
  const state = await availabilityOf(name, availOpts);
  if (state === "missing") return unsupported(`the ${label}`, MEANING.missing);
  const head = [f("API", name), f("Model state", state)];
  if (state !== "available") return { ok: true, fields: head, note: MEANING[state] || "The browser reported this state." };
  const t0 = performance.now();
  const inst = await win()[name].create(createOpts);
  try {
    const out = await use(inst);
    return { ok: true, fields: [...head, ...out, f("Time", Math.round(performance.now() - t0), "ms")], note: MEANING.available + " Everything ran on this device." };
  } finally {
    try { inst.destroy?.(); } catch { /* ignore */ }
  }
}

addNew(["web.ai.summarizer-api"], "Summarize text on device", true, () =>
  aiCall("Summarizer", "Summarizer API", { type: "tldr", length: "short", format: "plain-text", outputLanguage: "en" },
    { type: "tldr", length: "short", format: "plain-text", outputLanguage: "en" },
    async (s) => [f("Input", SAMPLE), f("Summary", String(await s.summarize(SAMPLE)))]));

addNew(["web.ai.translator-api"], "Translate text on device", true, () =>
  aiCall("Translator", "Translator API", { sourceLanguage: "en", targetLanguage: "es" }, { sourceLanguage: "en", targetLanguage: "es" },
    async (t) => [f("From", "en"), f("To", "es"), f("Input", SAMPLE.split(". ")[0] + "."), f("Translation", String(await t.translate(SAMPLE.split(". ")[0] + ".")))]));

addNew(["web.ai.language-detector"], "Detect language on device", true, () =>
  aiCall("LanguageDetector", "Language Detector API", undefined, undefined, async (d) => {
    const text = "Bonjour, je voudrais réserver une table pour deux ce soir.";
    const r: any[] = await d.detect(text);
    return [f("Input", text), f("Top language", r[0]?.detectedLanguage ?? null), f("Confidence", num(r[0]?.confidence, 3)),
      f("Runner up", r[1] ? `${r[1].detectedLanguage} (${num(r[1].confidence, 3)})` : null)];
  }));

addNew(["web.ai.prompt-api"], "Prompt Gemini Nano", true, () =>
  aiCall("LanguageModel", "Prompt API", LANG, LANG, async (s) => {
    const q = "In one sentence, what can a web page learn about a visitor without asking?";
    return [f("Prompt", q), f("Answer", String(await s.prompt(q))), f("Context window", s.inputQuota ?? s.maxTokens ?? null, "tokens")];
  }));

addNew(["web.ai.writer-api"], "Write text on device", true, () =>
  aiCall("Writer", "Writer API", { tone: "neutral", format: "plain-text", length: "short" }, { tone: "neutral", format: "plain-text", length: "short" },
    async (w) => { const p = "A two sentence note explaining what browser permissions are."; return [f("Task", p), f("Draft", String(await w.write(p)))]; }));

addNew(["web.ai.rewriter-api"], "Rewrite text on device", true, () =>
  aiCall("Rewriter", "Rewriter API", { tone: "more-casual", format: "plain-text", length: "as-is" }, { tone: "more-casual", format: "plain-text", length: "as-is" },
    async (r) => { const t = SAMPLE.split(". ")[1] + "."; return [f("Input", t), f("Rewritten", String(await r.rewrite(t)))]; }));

addNew(["web.ai.proofreader-api"], "Proofread text on device", true, () =>
  aiCall("Proofreader", "Proofreader API", { expectedInputLanguages: ["en"] }, { expectedInputLanguages: ["en"] },
    async (p) => { const t = "Their going too the park tomorow."; const r = await p.proofread(t); return [f("Input", t), f("Corrected", String(r?.correctedInput ?? r)), f("Fixes", Array.isArray(r?.corrections) ? r.corrections.length : null)]; }));

addNew(["web.ai.gemini-nano-requirements"], "On-device model status", false, async () => {
  const names: [string, unknown][] = [["LanguageModel", LANG], ["Summarizer", { outputLanguage: "en" }], ["Translator", { sourceLanguage: "en", targetLanguage: "es" }],
    ["LanguageDetector", undefined], ["Writer", undefined], ["Rewriter", undefined], ["Proofreader", { expectedInputLanguages: ["en"] }]];
  const fields: Field[] = [];
  for (const [n, o] of names) fields.push(f(n, await availabilityOf(n, o)));
  const any = fields.some((x) => x.value !== "missing");
  return any
    ? { ok: true, fields, note: "available means the model is on disk; downloadable means it would download on first use. Nothing was downloaded." }
    : unsupported("built in AI", "None of the on-device model APIs are exposed in this browser.");
});

// ---------------------------------------------------------------- Capture

let ptzStream: MediaStream | null = null;
addNew(["web.camera.camera-ptz"], "Camera pan, tilt and zoom", true, async () => {
  if (!nav().mediaDevices?.getSupportedConstraints?.().pan) return unsupported("camera pan and tilt control", "Chromium only, and only with a PTZ capable camera.");
  ptzStream = await navigator.mediaDevices.getUserMedia({ video: { pan: true, tilt: true, zoom: true } as any });
  const t: any = ptzStream.getVideoTracks()[0];
  const caps = t.getCapabilities?.() || {};
  const set = t.getSettings?.() || {};
  const rng = (r: any) => (r && typeof r.min === "number" ? `${r.min} to ${r.max}` : "not offered");
  return {
    ok: true, media: ptzStream,
    fields: [f("Camera", t.label || "camera"), f("Pan range", rng(caps.pan)), f("Tilt range", rng(caps.tilt)), f("Zoom range", rng(caps.zoom)),
      f("Pan now", set.pan ?? null), f("Tilt now", set.tilt ?? null), f("Zoom now", set.zoom ?? null)],
    note: caps.pan ? "This camera can be steered by the page." : "The browser allowed the request, but this camera has no motors, so only the video came back.",
  };
}, () => { stopStream(ptzStream); ptzStream = null; });

let cscStream: MediaStream | null = null;
addNew(["web.camera.captured-surface-control"], "Captured Surface Control", true, async () => {
  const CC = win().CaptureController;
  if (!CC || !("sendWheel" in CC.prototype)) return unsupported("Captured Surface Control", "Chrome 136 and later on desktop.");
  const controller = new CC();
  cscStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, controller });
  const fields: Field[] = [f("Surface", (cscStream!.getVideoTracks()[0].getSettings() as any).displaySurface ?? null)];
  try { fields.push(f("Zoom levels", (controller.getSupportedZoomLevels?.() || []).join(", ") || "none")); } catch { fields.push(f("Zoom levels", "only for a captured tab")); }
  try { fields.push(f("Zoom now", controller.zoomLevel ?? (await controller.getZoomLevel?.()) ?? null, "%")); } catch { /* tab only */ }
  return { ok: true, media: cscStream!, fields, note: "With this, a page can scroll and zoom the tab you shared, after a second prompt." };
}, () => { stopStream(cscStream); cscStream = null; });

let cropStream: MediaStream | null = null;
addNew(["web.camera.region-element-capture"], "Region capture of this tab", true, async () => {
  const CT = win().CropTarget;
  if (!CT) return unsupported("Region Capture", "Chromium desktop only.");
  cropStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, preferCurrentTab: true });
  const track: any = cropStream!.getVideoTracks()[0];
  const target = await CT.fromElement(document.querySelector("header") || document.body);
  let cropped = false;
  try { await track.cropTo(target); cropped = true; } catch { /* only works when this tab was picked */ }
  return {
    ok: true, media: cropStream!,
    fields: [f("Surface", track.getSettings().displaySurface ?? null), f("Cropped to header", cropped), f("Element capture too", "RestrictionTarget" in window)],
    note: cropped ? "The video now shows only the page header." : "Cropping only works when you pick this tab in the chooser.",
  };
}, () => { stopStream(cropStream); cropStream = null; });

// ---------------------------------------------------------------- Network and cross site

addNew(["web.xsite.fetchlater"], "Deferred beacon (fetchLater)", false, async () => {
  if (!win().fetchLater) return unsupported("fetchLater", "Chrome 135 and later.");
  const ac = new AbortController();
  const r = win().fetchLater(location.origin + "/?fetchlater-probe", { activateAfter: 60000, signal: ac.signal });
  const queued = r?.activated === false;
  ac.abort();
  return { ok: true, fields: [f("Queued", queued), f("Sent", r?.activated ?? null), f("Cancelled", true)], note: "A page can queue a request that the browser sends even after you close the tab. The console cancelled its test request before it went out." };
});

addNew(["web.xsite.speculation-rules-prefetch"], "Speculation rules", false, async () => {
  const sup = !!(HTMLScriptElement as any).supports?.("speculationrules");
  if (!sup) return unsupported("speculation rules");
  const nav0: any = performance.getEntriesByType("navigation")[0];
  return { ok: true, fields: [f("Rules supported", sup), f("This page was prerendered", nav0?.activationStart > 0), f("Prerendering now", !!(document as any).prerendering), f("Delivery type", nav0?.deliveryType || "normal")],
    note: "A site can tell the browser to fetch or fully render the next page before you click." };
});

addNew(["web.xsite.third-party-cookies-status"], "Third party cookie access", false, async () => {
  if (!("hasStorageAccess" in document)) return unsupported("the Storage Access API");
  const has = await (document as any).hasStorageAccess();
  return { ok: true, fields: [f("Has storage access", has), f("Top level page", window.top === window), f("Cookies enabled", navigator.cookieEnabled)] };
});

const uaHigh = async (): Promise<RealResult> => {
  const d = nav().userAgentData;
  if (!d) return unsupported("User-Agent Client Hints", "Chromium only. Firefox and Safari send the old User-Agent string.");
  const h = await d.getHighEntropyValues(["architecture", "bitness", "model", "platformVersion", "fullVersionList", "wow64", "formFactors"]);
  return { ok: true, fields: [f("Brands", d.brands.map((b: any) => `${b.brand} ${b.version}`).join(", ")), f("Mobile", d.mobile), f("Platform", d.platform),
    f("Platform version", h.platformVersion ?? null), f("Architecture", h.architecture ?? null), f("Bitness", h.bitness ?? null), f("Model", h.model || "none"),
    f("Full versions", (h.fullVersionList || []).map((b: any) => `${b.brand} ${b.version}`).join(", ")), f("Form factors", (h.formFactors || []).join(", ") || null)],
    note: "The same values go to any server that asks with an Accept-CH header." };
};
addNew(["web.net.client-hints", "web.net.sec-ch-ua"], "Client hints", false, uaHigh);

addNew(["web.network.device-client-hints"], "Device client hints", false, async () => ({
  ok: true, fields: [f("Device memory", nav().deviceMemory ?? null, "GB"), f("DPR", num(devicePixelRatio)), f("Viewport width", innerWidth, "px"), f("Viewport height", innerHeight, "px")],
  note: "These numbers are what Sec-CH-Device-Memory, Sec-CH-DPR and Sec-CH-Viewport-Width tell the server.",
}));
addNew(["web.network.ect-client-hints", "web.network.save-data-header"], "Network quality hints", false, async () => {
  const c = nav().connection;
  if (!c) return unsupported("the Network Information API", "Chromium only.");
  return { ok: true, fields: [f("Effective type", c.effectiveType ?? null), f("RTT", c.rtt ?? null, "ms"), f("Downlink", c.downlink ?? null, "Mbps"), f("Save-Data", !!c.saveData)],
    note: "The ECT, RTT, Downlink and Save-Data request headers carry these same values." };
});

addNew(["web.net.local-network-access", "web.network.local-network"], "Local network access permission", false, async () => {
  const fields: Field[] = [];
  for (const name of ["local-network-access", "local-network", "loopback-network"]) {
    try { fields.push(f(name, (await nav().permissions.query({ name })).state)); } catch { fields.push(f(name, "not known here")); }
  }
  if (fields.every((x) => x.value === "not known here")) return unsupported("Local Network Access", "Chrome 141 and later gate requests from public sites to your router and LAN devices.");
  return { ok: true, fields, note: "Before a public site can reach a device on your home network, Chrome asks first." };
});

// ---------------------------------------------------------------- Display and input

let pipWin: Window | null = null;
addNew(["web.display.document-pip"], "Document Picture-in-Picture", true, async () => {
  const dp = win().documentPictureInPicture;
  if (!dp) return unsupported("Document Picture-in-Picture", "Chromium desktop only.");
  pipWin = await dp.requestWindow({ width: 360, height: 180 });
  const d = pipWin!.document;
  d.body.style.cssText = "margin:0;font:14px system-ui;background:#111418;color:#e8eaed;display:grid;place-items:center;height:100vh";
  d.body.innerHTML = `<div style="text-align:center"><b>Platform Ontology</b><p id="t" style="margin:6px 0 0;opacity:.8"></p></div>`;
  const t = d.getElementById("t")!;
  const tick = () => { t.textContent = "Always on top: " + new Date().toLocaleTimeString(); };
  tick(); const id = pipWin!.setInterval(tick, 1000);
  pipWin!.addEventListener("pagehide", () => { clearInterval(id); pipWin = null; });
  return { ok: true, fields: [f("Window open", true), f("Width", pipWin!.innerWidth, "px"), f("Height", pipWin!.innerHeight, "px")], note: "A floating window now sits on top of every app. Stop closes it." };
}, () => { try { pipWin?.close(); } catch { /* ignore */ } pipWin = null; });

addNew(["web.display.keyboard-lock", "web.input.keyboard-lock"], "Keyboard lock", true, async () => {
  const k = nav().keyboard;
  if (!k?.lock) return unsupported("Keyboard Lock", "Chromium desktop only.");
  await k.lock(["Escape", "KeyW", "KeyN", "KeyT"]);
  return { ok: true, fields: [f("Locked keys", "Escape, W, N, T"), f("Fullscreen now", !!document.fullscreenElement)],
    note: "In fullscreen, those keys now go to the page instead of the browser (Escape needs a long press to exit). Stop unlocks them." };
}, () => { try { nav().keyboard?.unlock(); } catch { /* ignore */ } });

addNew(["web.input.edit-context"], "EditContext", false, async () => {
  const EC = win().EditContext;
  if (!EC) return unsupported("EditContext", "Chromium only.");
  const ec = new EC({ text: "hello", selectionStart: 5, selectionEnd: 5 });
  const div = document.createElement("div");
  (div as any).editContext = ec;
  ec.updateText(5, 5, " world");
  const out = [f("Attached", (div as any).editContext === ec), f("Text model", ec.text), f("Selection", `${ec.selectionStart} to ${ec.selectionEnd}`), f("Character bounds API", typeof ec.updateCharacterBounds === "function")];
  (div as any).editContext = null;
  return { ok: true, fields: out, note: "Editors like Google Docs use this to own typing and IME input instead of a contenteditable." };
});

addNew(["web.input.virtual-keyboard"], "Virtual keyboard control", false, async () => {
  const vk = nav().virtualKeyboard;
  if (!vk) return unsupported("the VirtualKeyboard API", "Chromium only.");
  const r = vk.boundingRect;
  return { ok: true, fields: [f("Overlays content", vk.overlaysContent), f("Keyboard height now", Math.round(r?.height ?? 0), "px"), f("show() available", typeof vk.show === "function")],
    note: "On touch devices a page can take over where the on-screen keyboard appears." };
});

addNew(["web.os.window-controls-overlay"], "Window Controls Overlay", false, async () => {
  const w = nav().windowControlsOverlay;
  if (!w) return unsupported("Window Controls Overlay", "Chromium desktop, installed apps only.");
  const r = w.getTitlebarAreaRect();
  return { ok: true, fields: [f("Overlay visible", w.visible), f("Title bar width", Math.round(r.width), "px"), f("Title bar height", Math.round(r.height), "px")],
    note: w.visible ? "This app draws its own title bar." : "Only an installed app with display_override window-controls-overlay can draw into the title bar." };
});

// ---------------------------------------------------------------- Storage, identity, payments

addNew(["web.storage.file-system-access", "web.files.file-system-access-pickers"], "Open a file with a handle", true, async () => {
  if (!win().showOpenFilePicker) return unsupported("the File System Access pickers", "Chromium desktop only.");
  const [h] = await win().showOpenFilePicker({ multiple: false });
  const file: File = await h.getFile();
  let perm = "unknown";
  try { perm = await h.queryPermission({ mode: "readwrite" }); } catch { /* ignore */ }
  return { ok: true, fields: [f("Name", file.name), f("Size", file.size, "bytes"), f("Type", file.type || "unknown"), f("Modified", new Date(file.lastModified).toISOString()), f("Handle kind", h.kind), f("Write permission", perm)],
    note: "Only the name, size and type are shown. The page now holds a handle it could keep in IndexedDB and reopen later." };
});

addNew(["web.auth.password-credential-management", "web.identity.credential-management"], "Saved password lookup (silent)", true, async () => {
  if (!win().PasswordCredential) return unsupported("PasswordCredential", "Chromium only. Safari and Firefox fill passwords but give pages no API.");
  const c: any = await navigator.credentials.get({ password: true, mediation: "silent" } as any);
  return { ok: true, fields: [f("Credential returned", !!c), f("Type", c?.type ?? null)],
    note: c ? "The browser handed this site a saved sign-in without asking. The console does not display it." : "Nothing came back silently. With mediation optional the browser would show an account chooser." };
});

addNew(["web.payments.secure-payment-confirmation"], "Secure Payment Confirmation", false, async () => {
  const PR: any = win().PaymentRequest;
  if (!PR?.isSecurePaymentConfirmationAvailable) return unsupported("Secure Payment Confirmation", "Chromium on desktop and Android.");
  return { ok: true, fields: [f("Available", await PR.isSecurePaymentConfirmationAvailable())], note: "Banks use this to confirm a card payment with a passkey. No payment was started." };
});

addNew(["web.contacts.get-installed-related-apps"], "Installed related apps", false, async () => {
  if (!nav().getInstalledRelatedApps) return unsupported("getInstalledRelatedApps", "Chromium on Android and Windows.");
  const apps: any[] = await nav().getInstalledRelatedApps();
  return { ok: true, fields: [f("Apps found", apps.length), f("Apps", apps.map((a) => `${a.platform}:${a.id || a.url}`).join(", ") || "none")],
    note: "A site sees its own native app here only if both sides declare each other. This site declares none." };
});

// ---------------------------------------------------------------- Performance and hardware

let pressureObs: any = null;
addNew(["web.perf.compute-pressure", "web.peripherals.compute-pressure"], "CPU pressure", false, async () => {
  const PO = win().PressureObserver;
  if (!PO) return unsupported("the Compute Pressure API", "Chromium desktop only.");
  const recs: any[] = [];
  pressureObs = new PO((r: any[]) => recs.push(...r));
  await pressureObs.observe("cpu", { sampleInterval: 500 });
  for (let i = 0; i < 12 && !recs.length; i++) await sleep(250);
  const last = recs[recs.length - 1];
  pressureObs.disconnect(); pressureObs = null;
  return { ok: true, fields: [f("CPU state", last?.state ?? "no change yet"), f("Samples", recs.length), f("Own contribution", last?.ownContributionEstimate ?? null)],
    note: "nominal, fair, serious or critical. Video apps use it to lower quality before your fan spins up." };
}, () => { try { pressureObs?.disconnect(); } catch { /* ignore */ } pressureObs = null; });

addNew(["web.perf.long-animation-frames"], "Long animation frames", false, async () => {
  if (!(PerformanceObserver as any).supportedEntryTypes?.includes("long-animation-frame")) return unsupported("Long Animation Frames", "Chromium only.");
  const seen: any[] = [];
  const po = new PerformanceObserver((l) => seen.push(...l.getEntries()));
  po.observe({ type: "long-animation-frame", buffered: true } as any);
  await sleep(1500); po.disconnect();
  const worst = seen.reduce((m, e) => (e.duration > (m?.duration ?? 0) ? e : m), null as any);
  return { ok: true, fields: [f("Frames over 50 ms", seen.length), f("Worst frame", num(worst?.duration, 0), "ms"), f("Worst blocking", num(worst?.blockingDuration, 0), "ms"), f("Scripts in worst", worst?.scripts?.length ?? 0)],
    note: "Sites use this to find which script made the page feel slow, down to the function." };
});

addNew(["web.perf.measure-user-agent-memory"], "Page memory use", false, async () => {
  if (!("measureUserAgentSpecificMemory" in performance)) return unsupported("measureUserAgentSpecificMemory", "Chromium only.");
  if (!crossOriginIsolated) return { ok: true, fields: [f("Cross origin isolated", false), f("Measured", false)], note: "The API exists here, but it only runs on pages served with COOP and COEP headers. This site does not send them." };
  const m: any = await (performance as any).measureUserAgentSpecificMemory();
  return { ok: true, fields: [f("Bytes", m.bytes, "bytes"), f("Breakdown entries", m.breakdown?.length ?? 0)] };
});

addNew(["web.timing.page-lifecycle-bfcache"], "Page lifecycle and back/forward cache", false, async () => {
  const n0: any = performance.getEntriesByType("navigation")[0];
  const nr = n0?.notRestoredReasons;
  return { ok: true, fields: [f("Was discarded", !!(document as any).wasDiscarded), f("Visibility", document.visibilityState), f("Navigation type", n0?.type ?? null),
    f("Not restored reasons", nr ? (nr.reasons || []).map((r: any) => r.reason).join(", ") || "none" : "API missing")],
    note: "Chrome freezes and discards background tabs; a page can tell when it was thrown away and why it could not be cached." };
});

addNew(["web.peripherals.presentation-api"], "Cast display availability", false, async () => {
  const PR = win().PresentationRequest;
  if (!PR) return unsupported("the Presentation API", "Chromium only.");
  const req = new PR([location.href]);
  try {
    const a = await req.getAvailability();
    return { ok: true, fields: [f("A screen is available", a.value)], note: "Monitors in the background for Chromecast or second screens. start() would open the cast picker." };
  } catch (e) {
    if ((e as any)?.name === "NotSupportedError") return { ok: true, fields: [f("A screen is available", "unknown")], note: "This platform cannot watch for screens in the background, but start() still opens the cast picker." };
    return fail(e, "cast display availability");
  }
});

const xr = async (): Promise<RealResult> => {
  const x = nav().xr;
  if (!x) return unsupported("WebXR", "Chromium with a headset, or Android with ARCore.");
  const q = async (m: string) => { try { return await x.isSessionSupported(m); } catch { return false; } };
  return { ok: true, fields: [f("immersive-vr", await q("immersive-vr")), f("immersive-ar", await q("immersive-ar")), f("inline", await q("inline"))],
    note: "Asked only whether a session could start. Starting one needs a headset and a click." };
};
addNew(["web.peripherals.webxr-immersive", "web.peripherals.webxr-hand-tracking", "web.peripherals.webxr-world-sensing"], "WebXR session support", false, xr);
