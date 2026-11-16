import type { Atlas } from "../core/types";

// Identity of the browser running this page. Detected from feature probes first,
// the user agent second, so a spoofed UA string cannot fool the engine call.

export type Engine = "Blink" | "Gecko" | "WebKit" | "Unknown";
/** Index into the atlas `sup` string: chrome, edge, firefox, safari, ios_safari, chrome_android, samsung. */
export type BrowserKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Profile = {
  brand: string; version: string; engine: Engine; os: string; osVersion: string;
  device: "phone" | "tablet" | "desktop"; touch: boolean; column: BrowserKey; columnLabel: string;
  uaSpoofed: boolean; ua: string; uaBrands: string; secure: boolean; standalone: boolean;
  dark: boolean; reducedMotion: boolean; dpr: number; coarse: boolean;
};

const LABEL = ["Chrome", "Edge", "Firefox", "Safari", "iOS Safari", "Android Chrome", "Samsung"];
const w = window as any;
const n = navigator as any;
const mq = (q: string) => { try { return matchMedia(q).matches; } catch { return false; } };

function engine(): Engine {
  const ua = n.userAgent;
  if (typeof w.InstallTrigger !== "undefined" || "mozInnerScreenX" in w || /Firefox\//.test(ua)) return "Gecko";
  if (w.chrome || "userAgentData" in n || /Chrome|Chromium|Edg|SamsungBrowser/.test(ua)) return "Blink";
  if (/AppleWebKit/.test(ua) || "webkitAudioContext" in w || "safari" in w) return "WebKit";
  return "Unknown";
}

function brandVersion(): { brand: string; version: string; brands: string } {
  const ua: string = n.userAgent;
  const list: { brand: string; version: string }[] = n.userAgentData?.brands || [];
  const brands = list.filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ");
  const m = (re: RegExp) => ua.match(re)?.[1] || "";
  if (/Edg(?:A|iOS)?\//.test(ua)) return { brand: "Edge", version: m(/Edg(?:A|iOS)?\/([\d.]+)/), brands };
  if (/SamsungBrowser\//.test(ua)) return { brand: "Samsung Internet", version: m(/SamsungBrowser\/([\d.]+)/), brands };
  if (/OPR\//.test(ua)) return { brand: "Opera", version: m(/OPR\/([\d.]+)/), brands };
  if (/FxiOS\//.test(ua)) return { brand: "Firefox", version: m(/FxiOS\/([\d.]+)/), brands };
  if (/Firefox\//.test(ua)) return { brand: "Firefox", version: m(/Firefox\/([\d.]+)/), brands };
  if (/CriOS\//.test(ua)) return { brand: "Chrome", version: m(/CriOS\/([\d.]+)/), brands };
  if (/Chrome\//.test(ua)) return { brand: n.brave ? "Brave" : "Chrome", version: m(/Chrome\/([\d.]+)/), brands };
  if (/Version\/[\d.]+.*Safari/.test(ua)) return { brand: "Safari", version: m(/Version\/([\d.]+)/), brands };
  return { brand: "Unknown browser", version: "", brands };
}

function os(): { os: string; v: string } {
  const ua: string = n.userAgent;
  const p: string = n.userAgentData?.platform || n.platform || "";
  if (/iPhone|iPad|iPod/.test(ua) || (p === "MacIntel" && n.maxTouchPoints > 1)) return { os: "iOS", v: (ua.match(/OS ([\d_]+)/)?.[1] || "").replace(/_/g, ".") };
  if (/Android/.test(ua)) return { os: "Android", v: ua.match(/Android ([\d.]+)/)?.[1] || "" };
  if (/Mac/.test(p) || /Mac OS X/.test(ua)) return { os: "macOS", v: (ua.match(/Mac OS X ([\d_]+)/)?.[1] || "").replace(/_/g, ".") };
  if (/Win/.test(p)) return { os: "Windows", v: ua.match(/Windows NT ([\d.]+)/)?.[1] || "" };
  if (/CrOS/.test(ua)) return { os: "ChromeOS", v: "" };
  if (/Linux/.test(p) || /Linux/.test(ua)) return { os: "Linux", v: "" };
  return { os: p || "Unknown", v: "" };
}

export function detectProfile(): Profile {
  const eng = engine();
  const bv = brandVersion();
  const o = os();
  const touch = n.maxTouchPoints > 0;
  const small = Math.min(screen.width, screen.height) < 600;
  const device: Profile["device"] = o.os === "iOS" || o.os === "Android" ? (small ? "phone" : "tablet") : "desktop";
  let column: BrowserKey = 0;
  if (bv.brand === "Edge") column = 1;
  else if (bv.brand === "Firefox") column = 2;
  else if (bv.brand === "Samsung Internet") column = 6;
  else if (o.os === "iOS") column = 4;
  else if (bv.brand === "Safari") column = 3;
  else if (o.os === "Android") column = 5;
  // A UA that claims one engine while feature probes say another.
  const claimsBlink = /Chrome\//.test(n.userAgent), claimsGecko = /Firefox\//.test(n.userAgent);
  const uaSpoofed = (claimsBlink && eng === "Gecko") || (claimsGecko && eng === "Blink") || (claimsBlink && eng === "WebKit" && o.os !== "iOS");
  return {
    brand: bv.brand, version: bv.version, engine: eng, os: o.os, osVersion: o.v, device, touch, column, columnLabel: LABEL[column],
    uaSpoofed, ua: n.userAgent, uaBrands: bv.brands, secure: !!w.isSecureContext,
    standalone: mq("(display-mode: standalone)") || !!n.standalone, dark: mq("(prefers-color-scheme: dark)"),
    reducedMotion: mq("(prefers-reduced-motion: reduce)"), dpr: w.devicePixelRatio || 1, coarse: mq("(pointer: coarse)"),
  };
}

export type Score = { yes: number; partial: number; flag: number; no: number; total: number; pct: number };
export function supportOf(sup: string, col: number) {
  return sup[col] || "u";
}
export function scoreFor(atlas: Atlas, col: number, domain?: string): Score {
  const s: Score = { yes: 0, partial: 0, flag: 0, no: 0, total: 0, pct: 0 };
  for (const nd of atlas.nodes) {
    if (domain && nd.d !== domain) continue;
    const c = supportOf(nd.sup, col);
    s.total++;
    if (c === "y") s.yes++;
    else if (c === "p") s.partial++;
    else if (c === "f") s.flag++;
    else s.no++;
  }
  s.pct = s.total ? Math.round(((s.yes + s.partial * 0.5) / s.total) * 100) : 0;
  return s;
}
