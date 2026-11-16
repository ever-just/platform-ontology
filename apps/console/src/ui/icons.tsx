import { siAndroid, siApple, siFirefoxbrowser, siGooglechrome, siSafari } from "simple-icons";
import { Activity, Aperture, Ban, Check, CircleDot, CircleHelp, Eye, Flag, Hand, MousePointerClick, ScanSearch, ShieldQuestion, CircleCheck, CircleDashed, X } from "lucide-react";
import type { AccessMode, IconType, ScopeDef } from "../core/types";

// One icon vocabulary for the console: browser logos, access modes, access mechanisms and data layers.

export const BROWSERS = [
  { id: "chrome", name: "Chrome", short: "Chrome" },
  { id: "edge", name: "Edge", short: "Edge" },
  { id: "firefox", name: "Firefox", short: "Firefox" },
  { id: "safari", name: "Safari", short: "Safari" },
  { id: "ios_safari", name: "Safari on iPhone", short: "iPhone" },
  { id: "chrome_android", name: "Chrome on Android", short: "Android" },
  { id: "samsung", name: "Samsung Internet", short: "Samsung" },
] as const;

function Brand({ path, hex, size }: { path: string; hex: string; size: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={path} fill={"#" + hex} /></svg>;
}

function Edge({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#0C59A4" />
      <path d="M4.2 13.6C4.4 8.4 8 5 12.4 5c4 0 6.9 2.6 6.9 6 0 2.1-1.6 3.4-3.6 3.4-1.5 0-2.4-.6-2.4-1.3 0-.4.4-.7.4-1.6 0-1.6-1.4-2.7-3.4-2.7-3 0-5.1 2.4-5.1 5.6 0 3.9 3.3 7 7.6 7 2 0 3.8-.6 5.2-1.6-1.5 2.2-4.2 3.6-7.3 3.6-4.2 0-7.6-3-7.5-6.8z" fill="#3BC8E8" />
    </svg>
  );
}

function Samsung({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#7651F0" />
      <circle cx="12" cy="12" r="4.6" fill="#fff" />
      <ellipse cx="12" cy="12" rx="9" ry="2.6" fill="none" stroke="#fff" strokeWidth="1.4" transform="rotate(-24 12 12)" />
    </svg>
  );
}

/** Logo for a support column (see BROWSERS). Mobile columns carry a small platform badge. */
export function BrowserLogo({ col, size = 20 }: { col: number; size?: number }) {
  const main =
    col === 0 || col === 5 ? <Brand path={siGooglechrome.path} hex={siGooglechrome.hex} size={size} />
    : col === 1 ? <Edge size={size} />
    : col === 2 ? <Brand path={siFirefoxbrowser.path} hex={siFirefoxbrowser.hex} size={size} />
    : col === 3 || col === 4 ? <Brand path={siSafari.path} hex={siSafari.hex} size={size} />
    : <Samsung size={size} />;
  const badge = col === 4 ? siApple : col === 5 ? siAndroid : null;
  return (
    <span className="blogo" style={{ width: size, height: size }}>
      {main}
      {badge && <span className="blogo-b"><svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} aria-hidden="true"><path d={badge.path} fill={col === 4 ? "currentColor" : "#" + badge.hex} /></svg></span>}
    </span>
  );
}

const SUP_INFO: Record<string, { tone: string; label: string; Icon: IconType }> = {
  y: { tone: "ok", label: "works", Icon: CircleCheck },
  p: { tone: "warn", label: "works in part", Icon: CircleDashed },
  f: { tone: "warn", label: "behind a setting", Icon: Flag },
  n: { tone: "err", label: "not offered", Icon: Ban },
  u: { tone: "mute", label: "unknown", Icon: CircleHelp },
};
export const supInfo = (c: string) => SUP_INFO[c] || SUP_INFO.u;

/** Seven equal tiles, one per browser: logo, a small status glyph in the corner, the name below. Unsupported
 * browsers fade to greyscale. Colour is status only. The current browser gets a ring and a "You" tag. */
export function SupportMatrix({ sup, me, compact }: { sup: string; me?: number; compact?: boolean }) {
  return (
    <ul className={"smx2" + (compact ? " compact" : "")}>
      {BROWSERS.map((b, i) => {
        const c = sup[i] && SUP_INFO[sup[i]] ? sup[i] : "u";
        const s = supInfo(c);
        const you = i === me;
        const G = c === "y" ? Check : c === "n" ? X : c === "u" ? CircleHelp : CircleDot;
        const text = `${b.name}: ${s.label}${you ? " (this browser)" : ""}`;
        return (
          <li key={b.id} className={"smx2-t" + (you ? " me" : "")} data-s={c} title={text} aria-label={text}>
            <span className="smx2-l"><BrowserLogo col={i} size={compact ? 16 : 24} /></span>
            <span className="smx2-g" aria-hidden="true"><G size={compact ? 10 : 12} strokeWidth={2.6} /></span>
            {!compact && <span className="smx2-n">{b.short}</span>}
            {you && !compact && <span className="smx2-you">You</span>}
          </li>
        );
      })}
    </ul>
  );
}

// Access modes ------------------------------------------------------------------------------

export const MODES: { id: AccessMode; label: string; Icon: IconType; plain: string }[] = [
  { id: "detect", label: "Detect", Icon: ScanSearch, plain: "Finds out the API exists or reads one value." },
  { id: "stream", label: "Stream", Icon: Activity, plain: "Gives a continuous live feed." },
  { id: "create", label: "Create", Icon: Aperture, plain: "Produces something new, such as a photo, recording or file." },
];

export function ModeBadges({ modes, compact }: { modes?: Partial<Record<AccessMode, string>>; compact?: boolean }) {
  if (!modes) return null;
  return (
    <span className={"modes" + (compact ? " compact" : "")}>
      {MODES.filter((m) => modes[m.id]).map((m) => (
        <span key={m.id} className={"mode m-" + m.id} title={`${m.label}: ${modes[m.id]}`}>
          <m.Icon size={compact ? 11 : 12} />{!compact && m.label}
        </span>
      ))}
    </span>
  );
}

// Access mechanism --------------------------------------------------------------------------

export type Mechanism = "silent" | "prompt" | "chooser" | "click" | "unsupported";

export const MECH: Record<Mechanism, { label: string; plain: string; Icon: IconType }> = {
  silent: { label: "Silent", plain: "No prompt. Any page can read this.", Icon: Eye },
  prompt: { label: "Prompt", plain: "The browser asks you first.", Icon: ShieldQuestion },
  chooser: { label: "Chooser", plain: "You pick a device or item after a click.", Icon: MousePointerClick },
  click: { label: "Click", plain: "Needs a click on the page, no prompt.", Icon: Hand },
  unsupported: { label: "Not here", plain: "This browser does not offer it.", Icon: Ban },
};

export function mechanismOf(scope: ScopeDef, supChar?: string): Mechanism {
  if (supChar && !"yp".includes(supChar)) return "unsupported";
  if (scope.passive) return "silent";
  if (scope.gesture && !scope.permission) return "chooser";
  if (scope.permission) return "prompt";
  return "click";
}

export function MechBadge({ mech, label }: { mech: Mechanism; label?: boolean }) {
  const m = MECH[mech];
  return <span className={"mech k-" + mech} title={`${m.label}: ${m.plain}`}><m.Icon size={12} />{label && m.label}</span>;
}

export function CapIcon({ scope, size = 16, fallback }: { scope: ScopeDef; size?: number; fallback?: IconType }) {
  const I = scope.icon || fallback;
  return I ? <I size={size} strokeWidth={1.8} /> : null;
}
