// Builds public/data/console.json from data/web. Groups every web attribute by what the data is
// about (its relationship domain), not by which browser API exposes it, and keeps the links.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const WEB = path.join(ROOT, "data/web");
const OUT = path.resolve(here, "../public/data/console.json");

export const DOMAINS = [
  { id: "place", name: "Where you are", short: "Place", blurb: "Position, heading, time zone, language and network address. Each one narrows down where a person is." },
  { id: "motion", name: "How you move", short: "Motion", blurb: "Motion sensors, pointer, touch, typing rhythm and attention. Behaviour that can identify a person." },
  { id: "surroundings", name: "What is near you", short: "Nearby", blurb: "Bluetooth, USB, serial, MIDI, NFC, game controllers and casting targets around the device." },
  { id: "capture", name: "What you see and say", short: "Capture", blurb: "Camera, microphone, screen, speech, clipboard and on-device recognition." },
  { id: "device", name: "What you are using", short: "Device", blurb: "Battery, processor, memory, screens, storage and load. The hardware profile." },
  { id: "fingerprint", name: "What makes you unique", short: "Fingerprint", blurb: "Rendering, fonts, audio and engine quirks that combine into a stable identifier." },
  { id: "link", name: "How you are connected", short: "Network", blurb: "Connection type, speed, timing, protocols and headers." },
  { id: "identity", name: "Who you are", short: "Identity", blurb: "Sign in, passkeys, contacts, payments, storage and cross-site tracking." },
  { id: "reach", name: "How sites reach you later", short: "Reach", blurb: "Notifications, push, background work, install and page actions that outlive the visit." },
];

function domainOf(group, sub) {
  const s = sub || "";
  switch (group) {
    case "location-motion":
      return s === "Position" ? "place" : "motion";
    case "locale-preferences":
      return /Privacy/.test(s) ? "identity" : s === "Accessibility" || s === "Input" ? "device" : "place";
    case "network-connectivity":
      return ["Addressing", "Local network", "WebRTC", "DNS"].includes(s) ? "place" : "link";
    case "input-clipboard":
      return s === "Clipboard" || s === "Text" ? "capture" : s === "Fonts" ? "fingerprint" : "motion";
    case "timing-performance":
      return ["Behavioral biometrics", "Attention"].includes(s) ? "motion" : ["Side channels", "Timers", "Time"].includes(s) ? "fingerprint" : "device";
    case "peripherals-hardware":
      return s === "Shape detection" ? "capture" : ["System load", "Display hardware", "Haptics"].includes(s) ? "device" : "surroundings";
    case "camera-mic-screen":
    case "on-device-ai":
      return "capture";
    case "device-system-profile":
      if (["Sensors", "Input hardware"].includes(s)) return "motion";
      if (s === "Peripherals") return "surroundings";
      if (["Browser identity", "Client Hints", "Hardware IDs", "Audio", "Browser extensions", "Automation"].includes(s)) return "fingerprint";
      if (["History", "Identity"].includes(s)) return "identity";
      return "device";
    case "display-window":
      return s === "Input capture" ? "motion" : "device";
    case "rendering-fingerprint":
      return "fingerprint";
    case "identity-auth":
    case "personal-data-contacts":
    case "payments-commerce":
    case "cross-site-tracking":
    case "files-storage":
      return "identity";
    case "notifications-background":
    case "os-integration-install":
      return "reach";
    case "page-actions":
      return ["Interaction", "Attention"].includes(s) ? "motion" : ["Device output", "Media output"].includes(s) ? "surroundings" : "reach";
    default:
      return "device";
  }
}

const BROWSERS = ["chrome", "edge", "firefox", "safari", "ios_safari", "chrome_android", "samsung"];
const DASH = /[–—]/g;
const clean = (v) => (typeof v === "string" ? v.replace(DASH, ", ").replace(/ ,/g, ",") : v);

const entries = [];
for (const g of fs.readdirSync(WEB).sort()) {
  for (const f of fs.readdirSync(path.join(WEB, g)).sort()) {
    if (!f.endsWith(".json")) continue;
    entries.push(JSON.parse(fs.readFileSync(path.join(WEB, g, f), "utf8")));
  }
}

const nodes = entries.map((e) => {
  const w = (e.platforms && e.platforms.web) || {};
  const a = w.access || {};
  const sup = BROWSERS.map((b) => (w.support && w.support[b] && w.support[b].s) || "n").join("");
  const fields = ((e.data && e.data.fields) || []).slice(0, 10).map((x) => ({ n: clean(x.name), t: x.type || "", u: clean(x.unit || "") }));
  const n = {
    i: e.id,
    n: clean(e.name),
    k: e.kind,
    d: domainOf(e.group, e.subgroup),
    g: e.group,
    sg: clean(e.subgroup || ""),
    p: clean(e.plain || ""),
    m: clean((e.meaning || "").slice(0, 320)),
    sup,
  };
  if (w.api) n.api = clean(String(w.api).slice(0, 200));
  if (w.permission_name) n.perm = clean(w.permission_name);
  if (a.grant) n.gr = clean(a.grant);
  if (a.prompt_ui) n.ui = clean(String(a.prompt_ui).slice(0, 240));
  if (a.persistence) n.ps = clean(a.persistence);
  if (a.revocation) n.rv = clean(a.revocation);
  if (a.user_gesture) n.ug = 1;
  if (e.data && e.data.metric) n.dm = clean(e.data.metric);
  if (e.data && e.data.update) n.du = clean(e.data.update);
  if (fields.length) n.f = fields;
  const sc = e.scores || {};
  if (typeof sc.fingerprint_bits === "number") n.fb = sc.fingerprint_bits;
  if (typeof sc.sensitivity === "number") n.sv = sc.sensitivity;
  return n;
});

const ids = new Set(nodes.map((n) => n.i));
const seen = new Set();
const edges = [];
const add = (a, b, t) => {
  if (a === b || !ids.has(a) || !ids.has(b)) return;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (seen.has(k)) return;
  seen.add(k);
  edges.push([a, b, t]);
};
for (const e of entries) for (const r of e.related || []) add(e.id, typeof r === "string" ? r : r.id, "r");
const byPerm = {};
for (const n of nodes) if (n.perm) (byPerm[n.perm.split(/[ ,;(]/)[0]] ||= []).push(n.i);
for (const list of Object.values(byPerm)) for (let i = 1; i < list.length; i++) add(list[0], list[i], "p");

const counts = Object.fromEntries(DOMAINS.map((d) => [d.id, nodes.filter((n) => n.d === d.id).length]));
const out = { built: new Date().toISOString().slice(0, 10), browsers: BROWSERS, domains: DOMAINS.map((d) => ({ ...d, count: counts[d.id] })), nodes, edges };
const text = JSON.stringify(out);
if (DASH.test(text)) throw new Error("dash found in console data");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, text);
console.log(`console data: ${nodes.length} nodes, ${edges.length} edges, ${Math.round(text.length / 1024)} KB`, counts);
