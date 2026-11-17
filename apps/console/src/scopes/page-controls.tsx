import { useEffect, useState, type ReactNode } from "react";
import { AppWindow, AudioWaveform, Cookie, DoorOpen, Download, Link2, Maximize2, Palette, Tag, Volume2 } from "lucide-react";
import type { Ctx, InstrumentProps, ScopeDef, Session, Stop } from "../core/types";
import { every, unsupported } from "../core/harness";
import { Frame, Readout, Waiting, lastData } from "../ui/kit";
import "./page-controls.css";

// Page controls: things a page can both read and change about the browser around it, with no
// prompt. Each scope reads the current value, then the Instrument edits it for real while it runs.
// Stopping puts everything back. The Instrument talks to the running adapter through `sinks`.

export type Patch = Record<string, any>;
const sinks = new Map<string, (p: Patch) => void>();
export const errText = (e: any) => (e?.name ? `${e.name}: ${e.message}` : String(e));

/** Live: emit the real state now, after every edit, and whenever a watcher fires. Stop restores. */
export function bind(id: string, ctx: Ctx, o: { read: () => any; apply: (p: Patch) => any; watch?: (re: () => void) => Stop | void; restore?: () => void }): Stop {
  let alive = true;
  let error = "";
  const re = () => {
    if (!alive) return;
    Promise.resolve(o.read()).then((d) => { if (alive) ctx.emit({ ...d, error }); }, (e) => ctx.log(errText(e)));
  };
  const fail = (e: any) => { error = errText(e); ctx.log(error); re(); };
  sinks.set(id, (p) => {
    error = "";
    try { Promise.resolve(o.apply(p)).then(re, fail); } catch (e) { fail(e); }
  });
  ctx.granted();
  const unwatch = o.watch?.(re);
  re();
  return () => {
    alive = false;
    sinks.delete(id);
    unwatch?.();
    try { o.restore?.(); } catch { /* best effort */ }
  };
}

/** Simulated: the same editor drives a fake state; the real page is never touched. */
export function simulate<S extends Record<string, any>>(id: string, ctx: Ctx, init: S, reduce: (s: S, p: Patch) => S): Stop {
  ctx.granted();
  let s = init;
  ctx.emit({ ...s });
  sinks.set(id, (p) => { s = reduce(s, p); ctx.emit({ ...s }); });
  return () => { sinks.delete(id); };
}

/** Run one edit on a running page control, the same patch its buttons send. False when it is not running. */
export function runPageAction(id: string, p: Patch): boolean {
  const f = sinks.get(id);
  if (!f) return false;
  f(p);
  return true;
}

export function useCtl<T>(scope: ScopeDef, session: Session) {
  const d = lastData<T & { error?: string }>(session);
  const on = (session.state === "streaming" || session.state === "granted") && sinks.has(scope.id);
  return { d, on, sim: session.source === "sim", send: (p: Patch) => sinks.get(scope.id)?.(p) };
}

export function Panel({ on, sim, error, children, note }: { on: boolean; sim: boolean; error?: string; children: ReactNode; note?: string }) {
  return (
    <div className="pc">
      {children}
      {error && <p className="pc-msg err">{error}</p>}
      <p className="pc-foot">
        {!on ? "Stopped. Run it again to edit." : sim ? "Simulated: the edits change a pretend copy, your browser is untouched." : "Live: these edits change this real tab. Stop puts the original back."}
        {note ? " " + note : ""}
      </p>
    </div>
  );
}

export const short = (s: string, n = 64) => (s.length > n ? s.slice(0, n) + "…" : s);

// ---------- Tab title and icon ----------

type TabRec = { title: string; icon: string; iconKind: string; visible: boolean; flash: boolean; badge: number; badgeApi: boolean; error?: string };
const EMOJI = ["🧪", "🔥", "⭐", "💬"];

function drawIcon(kind: string, count: number): string {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return "";
  if (kind === "badge") {
    g.fillStyle = "#3b5bdb";
    g.beginPath(); g.roundRect(4, 4, 56, 56, 14); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 34px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("P", 30, 36);
    g.fillStyle = "#e03131"; g.beginPath(); g.arc(46, 18, 17, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = "bold 22px system-ui, sans-serif"; g.fillText(String(Math.min(count, 99)), 46, 19);
  } else {
    g.font = "50px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(kind, 32, 36);
  }
  return c.toDataURL("image/png");
}

const iconLinks = () => [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];

function tabLive(ctx: Ctx) {
  const id = "motion.tab-title";
  const origTitle = document.title;
  const orig = iconLinks().map((l) => [l, l.href] as const);
  let made: HTMLLinkElement | null = null;
  let kind = "original", flash = false, badge = 0, chosen = origTitle, timer = 0;
  const nav = navigator as any;
  const setIcon = (href: string | null) => {
    if (href === null) { orig.forEach(([l, h]) => { l.href = h; }); made?.remove(); made = null; return; }
    let ls = iconLinks();
    if (!ls.length) { made = document.createElement("link"); made.rel = "icon"; document.head.appendChild(made); ls = [made]; }
    ls.forEach((l) => { l.href = href; });
  };
  const flashTick = () => {
    clearInterval(timer);
    if (!flash || !document.hidden) { if (document.title !== chosen) document.title = chosen; return; }
    let on = false;
    timer = window.setInterval(() => { on = !on; document.title = on ? "(1) New message" : chosen; }, 1000);
  };
  return bind(id, ctx, {
    read: (): TabRec => ({ title: document.title, icon: iconLinks()[0]?.href || "", iconKind: kind, visible: !document.hidden, flash, badge, badgeApi: !!nav.setAppBadge }),
    apply: async (p) => {
      if (typeof p.title === "string") { chosen = p.title || origTitle; document.title = chosen; }
      if (p.icon) { kind = p.icon; setIcon(kind === "original" ? null : drawIcon(kind, badge || 3)); }
      if (typeof p.flash === "boolean") { flash = p.flash; flashTick(); }
      if (typeof p.badge === "number") {
        badge = p.badge;
        if (kind === "badge") setIcon(drawIcon("badge", badge || 3));
        if (nav.setAppBadge) await (badge ? nav.setAppBadge(badge) : nav.clearAppBadge());
      }
      if (p.reset) { chosen = origTitle; document.title = origTitle; kind = "original"; setIcon(null); flash = false; flashTick(); }
    },
    watch: (re) => {
      const mo = new MutationObserver(re);
      mo.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["href"] });
      const vis = () => { flashTick(); re(); };
      document.addEventListener("visibilitychange", vis);
      return () => { mo.disconnect(); document.removeEventListener("visibilitychange", vis); };
    },
    restore: () => {
      clearInterval(timer);
      document.title = origTitle;
      setIcon(null);
      if (badge && nav.clearAppBadge) nav.clearAppBadge().catch(() => {});
    },
  });
}

function tabSim(ctx: Ctx) {
  const base = { title: "Inbox · Example Mail", icon: "", iconKind: "original", visible: true, flash: false, badge: 0, badgeApi: true };
  return simulate<TabRec>("motion.tab-title", ctx, base, (s, p) => {
    const n = { ...s };
    if (typeof p.title === "string") n.title = p.title || base.title;
    if (p.icon) { n.iconKind = p.icon; n.icon = p.icon === "original" ? "" : drawIcon(p.icon, n.badge || 3); }
    if (typeof p.flash === "boolean") n.flash = p.flash;
    if (typeof p.badge === "number") { n.badge = p.badge; if (n.iconKind === "badge") n.icon = drawIcon("badge", p.badge || 3); }
    if (p.reset) return { ...base };
    return n;
  });
}

function TabInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<TabRec>(scope, session);
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState(3);
  useEffect(() => { if (d && !draft) setDraft(d.title); }, [d?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Frame visual={<Waiting session={session} what="Reads this tab's title and icon, then lets you change both." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Switch to another tab with flashing on to see it blink.">
          <div className="pc-chrome">
            <div className="pc-tabs">
              <div className="pc-tab on">
                {d.icon ? <img src={d.icon} alt="" width={16} height={16} /> : <span className="pc-noicon" />}
                <span>{d.title || "(no title)"}</span>
              </div>
              <div className="pc-tab"><span className="pc-noicon" /><span>Another tab</span></div>
            </div>
          </div>
          <form className="pc-row" onSubmit={(e) => { e.preventDefault(); send({ title: draft }); }}>
            <input className="pc-in" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="New tab title" disabled={!on} />
            <button className="btn sm pri" disabled={!on}>Set title</button>
          </form>
          <div className="pc-row">
            <span className="pc-l">Icon</span>
            <div className="seg">
              {["original", ...EMOJI, "badge"].map((k) => (
                <button key={k} type="button" className={d.iconKind === k ? "on" : ""} disabled={!on} onClick={() => send({ icon: k, badge: k === "badge" ? count : d.badge })}>{k === "original" ? "Original" : k === "badge" ? "Count" : k}</button>
              ))}
            </div>
          </div>
          <div className="pc-row">
            <span className="pc-l">Count</span>
            <input className="pc-num" type="number" min={0} max={99} value={count} onChange={(e) => setCount(Math.max(0, Math.min(99, +e.target.value || 0)))} disabled={!on} aria-label="Unread count" />
            <button className="btn sm" type="button" disabled={!on} onClick={() => send({ badge: count })}>Apply count</button>
            <label className="pc-sw"><input type="checkbox" checked={d.flash} disabled={!on} onChange={(e) => send({ flash: e.target.checked })} />Flash title when the tab is hidden</label>
          </div>
          <div className="pc-row"><button className="btn sm" type="button" disabled={!on} onClick={() => { send({ reset: true, badge: 0 }); setDraft(""); }}>Put back original</button></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Title", v: short(d.title, 40), hot: true },
        { k: "Icon", v: d.iconKind },
        { k: "Tab visible", v: d.visible ? "yes" : "no" },
        { k: "Flashing", v: d.flash ? "on" : "off" },
        { k: "App badge API", v: d.badgeApi ? "present" : "missing" },
        { k: "Count", v: d.badge, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Theme color (address bar color) ----------

type ThemeRec = { color: string; original: string; present: boolean; dark: boolean; error?: string };
const SWATCH = ["#3b5bdb", "#e03131", "#2f9e44", "#f08c00", "#111111", "#ffffff"];
const themeMeta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

function themeLive(ctx: Ctx) {
  const m0 = themeMeta();
  const original = m0?.content || "";
  let made: HTMLMetaElement | null = null;
  return bind("device.theme-color", ctx, {
    read: (): ThemeRec => ({ color: themeMeta()?.content || "", original, present: !!m0, dark: matchMedia("(prefers-color-scheme: dark)").matches }),
    apply: (p) => {
      let m = themeMeta();
      if (!m) { m = made = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
      m.content = p.reset ? original : p.color;
      if (p.reset && !m0) { made?.remove(); made = null; }
    },
    watch: (re) => { const mo = new MutationObserver(re); mo.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["content"] }); return () => mo.disconnect(); },
    restore: () => { if (m0) m0.content = original; made?.remove(); },
  });
}

function themeSim(ctx: Ctx) {
  return simulate<ThemeRec>("device.theme-color", ctx, { color: "#ffffff", original: "#ffffff", present: true, dark: false }, (s, p) => ({ ...s, color: p.reset ? s.original : p.color }));
}

function ThemeInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<ThemeRec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Reads the color the page asks the browser to paint its toolbar, then lets you change it." />} />;
  const col = d.color || "transparent";
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Safari, Chrome on Android and installed apps paint their toolbar in this color. Desktop Chrome ignores it in a normal tab.">
          <div className="pc-phone">
            <div className="pc-bar" style={{ background: col }}><span>platformontology.lol</span></div>
            <div className="pc-body" />
          </div>
          <div className="pc-row">
            <span className="pc-l">Color</span>
            {SWATCH.map((c) => <button key={c} type="button" className={"pc-sw-c" + (d.color === c ? " on" : "")} style={{ background: c }} aria-label={c} disabled={!on} onClick={() => send({ color: c })} />)}
            <input type="color" className="pc-color" value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#3b5bdb"} disabled={!on} onChange={(e) => send({ color: e.target.value })} aria-label="Pick any color" />
            <button className="btn sm" type="button" disabled={!on} onClick={() => send({ reset: true })}>Put back original</button>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Now", v: d.color || "none", hot: true },
        { k: "Original", v: d.original || "none" },
        { k: "Page set one", v: d.present ? "yes" : "no" },
        { k: "Dark mode", v: d.dark ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Address bar URL (History API) ----------

type UrlRec = { path: string; search: string; hash: string; length: number; state: string; nav: number | null; pushed: number; error?: string };

function urlLive(ctx: Ctx) {
  const path = location.pathname, search = location.search;
  let pushed = 0;
  const nav = (window as any).navigation;
  return bind("reach.address-bar", ctx, {
    read: (): UrlRec => ({
      path: location.pathname, search: location.search, hash: location.hash, length: history.length,
      state: history.state ? JSON.stringify(history.state) : "none", nav: nav?.entries ? nav.entries().length : null, pushed,
    }),
    apply: (p) => {
      if (p.reset) { history.replaceState(null, "", path + search + location.hash); return; }
      const q = String(p.query || "").replace(/^\?/, "").replace(/[^\w=&%.~+-]/g, "");
      const url = path + (q ? "?" + q : "") + location.hash;
      if (p.op === "push") { pushed++; history.pushState({ demo: pushed }, "", url); } else history.replaceState({ demo: "replaced" }, "", url);
    },
    watch: (re) => { addEventListener("popstate", re); addEventListener("hashchange", re); return () => { removeEventListener("popstate", re); removeEventListener("hashchange", re); }; },
    restore: () => history.replaceState(null, "", path + search + location.hash),
  });
}

function urlSim(ctx: Ctx) {
  return simulate<UrlRec>("reach.address-bar", ctx, { path: "/shop/item/42", search: "", hash: "", length: 3, state: "none", nav: 3, pushed: 0 }, (s, p) => {
    if (p.reset) return { ...s, search: "", state: "none" };
    const q = String(p.query || "").replace(/^\?/, "");
    return { ...s, search: q ? "?" + q : "", state: JSON.stringify({ demo: p.op }), length: s.length + (p.op === "push" ? 1 : 0), nav: (s.nav || 0) + (p.op === "push" ? 1 : 0), pushed: s.pushed + (p.op === "push" ? 1 : 0) };
  });
}

function UrlInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<UrlRec>(scope, session);
  const [q, setQ] = useState("ref=demo&step=2");
  if (!d) return <Frame visual={<Waiting session={session} what="Reads the address bar and back button history, then rewrites the address without loading a page." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Pushed entries stay in your back button history after Stop; a page cannot remove them.">
          <div className="pc-url"><span className="pc-lock">https://</span>{location.host}<b>{d.path}</b><em>{d.search}</em>{d.hash}</div>
          <form className="pc-row" onSubmit={(e) => { e.preventDefault(); send({ op: "replace", query: q }); }}>
            <span className="pc-l">Query</span>
            <input className="pc-in" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Query string to put in the address bar" disabled={!on} />
            <button className="btn sm pri" disabled={!on}>Replace</button>
            <button className="btn sm" type="button" disabled={!on} onClick={() => send({ op: "push", query: q })}>Push new entry</button>
            <button className="btn sm" type="button" disabled={!on} onClick={() => send({ reset: true })}>Put back</button>
          </form>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Path", v: d.path, hot: true },
        { k: "Query", v: d.search || "none" },
        { k: "History length", v: d.length, digits: 0 },
        { k: "Navigation entries", v: d.nav ?? "no API" },
        { k: "Pushed here", v: d.pushed, digits: 0 },
        { k: "State", v: short(d.state, 30) },
      ]} />}
    />
  );
}

// ---------- Fullscreen ----------

type FsRec = { enabled: boolean; active: boolean; screen: string; win: string; avail: string; error?: string };

function fsLive(ctx: Ctx) {
  const doc = document as any;
  const el = document.documentElement as any;
  let entered = false;
  const cur = () => doc.fullscreenElement || doc.webkitFullscreenElement;
  return bind("reach.fullscreen", ctx, {
    read: (): FsRec => ({
      enabled: !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled), active: !!cur(),
      screen: `${screen.width} × ${screen.height}`, win: `${innerWidth} × ${innerHeight}`, avail: `${screen.availWidth} × ${screen.availHeight}`,
    }),
    apply: (p) => {
      if (p.op === "enter") {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req) unsupported("requestFullscreen");
        entered = true;
        return req.call(el, { navigationUI: "hide" });
      }
      const ex = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (cur() && ex) return ex.call(doc);
    },
    watch: (re) => {
      const evs = ["fullscreenchange", "webkitfullscreenchange", "fullscreenerror"];
      evs.forEach((e) => document.addEventListener(e, re));
      addEventListener("resize", re);
      return () => { evs.forEach((e) => document.removeEventListener(e, re)); removeEventListener("resize", re); };
    },
    restore: () => { if (entered && cur()) (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc); },
  });
}

function fsSim(ctx: Ctx) {
  return simulate<FsRec>("reach.fullscreen", ctx, { enabled: true, active: false, screen: "1512 × 982", win: "1280 × 760", avail: "1512 × 944" }, (s, p) => ({ ...s, active: p.op === "enter", win: p.op === "enter" ? s.screen : "1280 × 760" }));
}

function FsInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<FsRec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Reads the screen and window size, then takes this page fullscreen from your click." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Fullscreen hides the address bar, which is why scam pages use it to fake a whole desktop. Press Esc to leave.">
          <div className={"pc-screen" + (d.active ? " full" : "")}><div><span>{d.active ? "Fullscreen" : "Window"}</span><b>{d.win}</b></div></div>
          <div className="pc-row">
            <button className="btn sm pri" type="button" disabled={!on || d.active} onClick={() => send({ op: "enter" })}>Go fullscreen</button>
            <button className="btn sm" type="button" disabled={!on || !d.active} onClick={() => send({ op: "exit" })}>Exit</button>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Fullscreen", v: d.active ? "on" : "off", hot: true },
        { k: "Allowed here", v: d.enabled ? "yes" : "no" },
        { k: "Screen", v: d.screen },
        { k: "Usable screen", v: d.avail },
        { k: "Window", v: d.win },
      ]} />}
    />
  );
}

// ---------- Read aloud (speech synthesis) ----------

type Voice = { name: string; lang: string; local: boolean };
type SpeakRec = { voices: number; langs: number; local: number; list: Voice[]; speaking: boolean; word: string; said: number; error?: string };

function speakLive(ctx: Ctx) {
  const ss = window.speechSynthesis;
  if (!ss) unsupported("speechSynthesis");
  let word = "", said = 0;
  const voices = () => ss.getVoices();
  let re = () => {};
  return bind("surroundings.read-aloud", ctx, {
    read: (): SpeakRec => {
      const v = voices();
      return { voices: v.length, langs: new Set(v.map((x) => x.lang)).size, local: v.filter((x) => x.localService).length, list: v.slice(0, 60).map((x) => ({ name: x.name, lang: x.lang, local: x.localService })), speaking: ss.speaking, word, said };
    },
    apply: (p) => {
      if (p.op === "cancel") { ss.cancel(); return; }
      const u = new SpeechSynthesisUtterance(String(p.text || "").slice(0, 400));
      const v = voices().find((x) => x.name === p.voice);
      if (v) u.voice = v;
      u.rate = +p.rate || 1; u.pitch = +p.pitch || 1;
      u.onstart = () => { said++; re(); };
      u.onboundary = (e) => { word = u.text.slice(e.charIndex, e.charIndex + (e.charLength || 12)).split(/\s/)[0]; re(); };
      u.onend = () => { word = ""; re(); };
      u.onerror = (e) => ctx.log("speech error: " + e.error);
      ss.speak(u);
    },
    watch: (r) => { re = r; ss.addEventListener("voiceschanged", r); return () => ss.removeEventListener("voiceschanged", r); },
    restore: () => ss.cancel(),
  });
}

function speakSim(ctx: Ctx) {
  const list: Voice[] = [["Samantha", "en-US"], ["Daniel", "en-GB"], ["Amélie", "fr-CA"], ["Anna", "de-DE"], ["Kyoko", "ja-JP"], ["Google US English", "en-US"]].map(([name, lang], i) => ({ name, lang, local: i < 5 }));
  return simulate<SpeakRec>("surroundings.read-aloud", ctx, { voices: 177, langs: 46, local: 171, list, speaking: false, word: "", said: 0 }, (s, p) => p.op === "cancel" ? { ...s, speaking: false } : { ...s, speaking: true, said: s.said + 1, word: String(p.text || "").split(/\s/)[0] });
}

function SpeakInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<SpeakRec>(scope, session);
  const [text, setText] = useState("This page can talk to you without asking.");
  const [voice, setVoice] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  if (!d) return <Frame visual={<Waiting session={session} what="Lists the voices installed on this device, then reads your text aloud." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="The installed voice list differs by system and language packs, so it doubles as a fingerprint.">
          <textarea className="pc-in pc-ta" value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="Text to read aloud" disabled={!on} />
          <div className="pc-row">
            <select className="pc-in pc-sel" value={voice} onChange={(e) => setVoice(e.target.value)} disabled={!on} aria-label="Voice">
              <option value="">Default voice</option>
              {d.list.map((v) => <option key={v.name + v.lang} value={v.name}>{v.name} ({v.lang})</option>)}
            </select>
            <label className="pc-rng">Speed <input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} disabled={!on} /><b>{rate.toFixed(1)}</b></label>
            <label className="pc-rng">Pitch <input type="range" min={0} max={2} step={0.1} value={pitch} onChange={(e) => setPitch(+e.target.value)} disabled={!on} /><b>{pitch.toFixed(1)}</b></label>
          </div>
          <div className="pc-row">
            <button className="btn sm pri" type="button" disabled={!on} onClick={() => send({ op: "speak", text, voice, rate, pitch })}>Read aloud</button>
            <button className="btn sm" type="button" disabled={!on || !d.speaking} onClick={() => send({ op: "cancel" })}>Stop speaking</button>
            {d.word && <span className="pc-word">{d.word}</span>}
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Voices", v: d.voices, digits: 0, hot: true },
        { k: "Languages", v: d.langs, digits: 0 },
        { k: "On device", v: d.local, digits: 0 },
        { k: "Speaking", v: d.speaking ? "yes" : "no" },
        { k: "Times spoken", v: d.said, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Tone generator (Web Audio) ----------

type ToneRec = { state: string; rate: number; base: number; out: number; playing: boolean; freq: number; gain: number; wave: string; error?: string };
const WAVES = ["sine", "square", "triangle", "sawtooth"];

function toneLive(ctx: Ctx) {
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) unsupported("AudioContext");
  const ac: AudioContext = new AC();
  const amp = ac.createGain();
  amp.connect(ac.destination);
  let osc: OscillatorNode | null = null;
  let freq = 440, gain = 0.15, wave = "sine";
  return bind("surroundings.tone", ctx, {
    read: (): ToneRec => ({ state: ac.state, rate: ac.sampleRate, base: Math.round((ac.baseLatency || 0) * 1000 * 10) / 10, out: Math.round(((ac as any).outputLatency || 0) * 1000 * 10) / 10, playing: !!osc, freq, gain, wave }),
    apply: async (p) => {
      if (typeof p.freq === "number") freq = p.freq;
      if (typeof p.gain === "number") gain = p.gain;
      if (p.wave) wave = p.wave;
      amp.gain.setTargetAtTime(gain, ac.currentTime, 0.02);
      if (osc) { osc.frequency.setTargetAtTime(freq, ac.currentTime, 0.02); osc.type = wave as OscillatorType; }
      if (p.playing === true && !osc) {
        await ac.resume();
        osc = ac.createOscillator(); osc.type = wave as OscillatorType; osc.frequency.value = freq; osc.connect(amp); osc.start();
      }
      if (p.playing === false && osc) { osc.stop(); osc.disconnect(); osc = null; }
    },
    watch: (re) => { ac.onstatechange = re; return () => { ac.onstatechange = null; }; },
    restore: () => { try { osc?.stop(); } catch { /* already stopped */ } ac.close(); },
  });
}

function toneSim(ctx: Ctx) {
  return simulate<ToneRec>("surroundings.tone", ctx, { state: "running", rate: 48000, base: 5.3, out: 22.7, playing: false, freq: 440, gain: 0.15, wave: "sine" }, (s, p) => ({ ...s, ...(typeof p.freq === "number" ? { freq: p.freq } : {}), ...(typeof p.gain === "number" ? { gain: p.gain } : {}), ...(p.wave ? { wave: p.wave } : {}), ...(typeof p.playing === "boolean" ? { playing: p.playing } : {}) }));
}

function wavePath(wave: string, freq: number): string {
  const cycles = Math.max(1, Math.min(12, Math.log2(freq / 55) * 2));
  const pts: string[] = [];
  for (let i = 0; i <= 240; i++) {
    const ph = ((i / 240) * cycles) % 1;
    const y = wave === "square" ? (ph < 0.5 ? 1 : -1) : wave === "triangle" ? 1 - 4 * Math.abs(ph - 0.5) : wave === "sawtooth" ? 2 * ph - 1 : Math.sin(ph * Math.PI * 2);
    pts.push(`${i},${30 - y * 24}`);
  }
  return "M" + pts.join(" L");
}

function ToneInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<ToneRec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Opens the audio engine, reads its timing, then plays a tone you shape." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Sound only starts from a click. The sample rate and latency also hint at your audio hardware.">
          <svg className={"pc-wave" + (d.playing ? " on" : "")} viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden><path d={wavePath(d.wave, d.freq)} /></svg>
          <div className="pc-row">
            <button className={"btn sm" + (d.playing ? "" : " pri")} type="button" disabled={!on} onClick={() => send({ playing: !d.playing })}>{d.playing ? "Stop tone" : "Play tone"}</button>
            <div className="seg">{WAVES.map((w) => <button key={w} type="button" className={d.wave === w ? "on" : ""} disabled={!on} onClick={() => send({ wave: w })}>{w}</button>)}</div>
          </div>
          <div className="pc-row">
            <label className="pc-rng">Pitch <input type="range" min={55} max={1760} step={1} value={d.freq} onChange={(e) => send({ freq: +e.target.value })} disabled={!on} /><b>{d.freq} Hz</b></label>
            <label className="pc-rng">Volume <input type="range" min={0} max={0.5} step={0.01} value={d.gain} onChange={(e) => send({ gain: +e.target.value })} disabled={!on} /><b>{Math.round(d.gain * 200)}%</b></label>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Engine", v: d.state, hot: true },
        { k: "Sample rate", v: d.rate, u: "Hz", digits: 0 },
        { k: "Base latency", v: d.base, u: "ms" },
        { k: "Output latency", v: d.out, u: "ms" },
        { k: "Tone", v: d.playing ? `${d.freq} Hz ${d.wave}` : "off" },
      ]} />}
    />
  );
}

// ---------- Leave warning (beforeunload) ----------

type LeaveRec = { armed: boolean; error?: string };

function leaveLive(ctx: Ctx) {
  let armed = false;
  const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
  return bind("reach.leave-warning", ctx, {
    read: (): LeaveRec => ({ armed }),
    apply: (p) => {
      if (p.reload) { location.reload(); return; }
      armed = !!p.armed;
      if (armed) addEventListener("beforeunload", h); else removeEventListener("beforeunload", h);
    },
    restore: () => removeEventListener("beforeunload", h),
  });
}

const leaveSim = (ctx: Ctx) => simulate<LeaveRec>("reach.leave-warning", ctx, { armed: false }, (s, p) => (p.reload ? s : { armed: !!p.armed }));

function LeaveInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<LeaveRec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Turns the 'Leave site?' warning on and off for this page." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Browsers only show it after you have clicked or typed on the page, and never let the page choose the words.">
          <div className={"pc-dialog" + (d.armed ? " on" : "")}>
            <b>Leave site?</b>
            <span>Changes you made may not be saved.</span>
            <div><i>Cancel</i><i className="pri">Leave</i></div>
          </div>
          <div className="pc-row">
            <label className="pc-sw"><input type="checkbox" checked={d.armed} disabled={!on} onChange={(e) => send({ armed: e.target.checked })} />Warn before leaving this page</label>
            {!sim && <button className="btn sm" type="button" disabled={!on || !d.armed} onClick={() => send({ reload: true })}>Reload to test</button>}
          </div>
        </Panel>
      }
      side={<Readout rows={[{ k: "Warning", v: d.armed ? "armed" : "off", hot: true }]} />}
    />
  );
}

// ---------- Cookies ----------

type CookieRow = { name: string; value: string; mine: boolean };
type CookieRec = { api: string; count: number; list: CookieRow[]; error?: string };
const DEMO = "po_demo";

function parseDocCookies(): { name: string; value: string }[] {
  return document.cookie ? document.cookie.split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) }; }) : [];
}

function cookieLive(ctx: Ctx) {
  const cs = (window as any).cookieStore;
  const mine = new Set<string>();
  const clean = (n: string) => n.replace(/[^\w-]/g, "").slice(0, 40) || DEMO;
  const del = (n: string) => (cs ? cs.delete(n) : (document.cookie = `${n}=; max-age=0; path=/`));
  return bind("reach.cookies", ctx, {
    read: async (): Promise<CookieRec> => {
      const all: { name: string; value: string }[] = cs ? await cs.getAll() : parseDocCookies();
      return { api: cs ? "cookieStore" : "document.cookie", count: all.length, list: all.map((c) => ({ name: c.name, value: c.value, mine: mine.has(c.name) })) };
    },
    apply: async (p) => {
      if (p.op === "set") {
        const name = clean(p.name), value = String(p.value || "").slice(0, 200);
        mine.add(name);
        if (cs) await cs.set({ name, value, expires: Date.now() + 3600e3, sameSite: "lax", path: "/" });
        else document.cookie = `${name}=${encodeURIComponent(value)}; max-age=3600; path=/; samesite=lax`;
      }
      if (p.op === "delete" && mine.has(p.name)) { await del(p.name); mine.delete(p.name); }
    },
    watch: (re) => {
      if (cs?.addEventListener) { cs.addEventListener("change", re); return () => cs.removeEventListener("change", re); }
      return every(2000, re);
    },
    restore: () => { mine.forEach((n) => { void del(n); }); },
  });
}

function cookieSim(ctx: Ctx) {
  const base: CookieRow[] = [{ name: "_ga", value: "GA1.1.20419.1731700000", mine: false }, { name: "session", value: "s%3Aabc123", mine: false }];
  return simulate<CookieRec>("reach.cookies", ctx, { api: "cookieStore", count: 2, list: base }, (s, p) => {
    let list = s.list;
    if (p.op === "set") list = [...list.filter((c) => c.name !== p.name), { name: p.name || DEMO, value: p.value, mine: true }];
    if (p.op === "delete") list = list.filter((c) => !(c.name === p.name && c.mine));
    return { ...s, list, count: list.length };
  });
}

function CookieInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<CookieRec>(scope, session);
  const [name, setName] = useState(DEMO);
  const [value, setValue] = useState("hello");
  if (!d) return <Frame visual={<Waiting session={session} what="Lists this site's cookies that scripts can see, then sets and deletes one." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Only cookies you add here can be deleted here, and Stop removes them. HttpOnly cookies never show up for scripts.">
          <div className="pc-list">
            {d.list.length ? d.list.map((c) => (
              <div key={c.name} className="pc-li">
                <code>{c.name}</code><span>{short(c.value, 48)}</span>
                {c.mine && <button className="btn sm" type="button" disabled={!on} onClick={() => send({ op: "delete", name: c.name })}>Delete</button>}
              </div>
            )) : <p className="pc-empty">No cookies visible to scripts on this site.</p>}
          </div>
          <form className="pc-row" onSubmit={(e) => { e.preventDefault(); send({ op: "set", name, value }); }}>
            <input className="pc-in pc-short" value={name} onChange={(e) => setName(e.target.value)} aria-label="Cookie name" disabled={!on} />
            <input className="pc-in" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Cookie value" disabled={!on} />
            <button className="btn sm pri" disabled={!on}>Set cookie</button>
          </form>
        </Panel>
      }
      side={<Readout rows={[{ k: "Cookies", v: d.count, digits: 0, hot: true }, { k: "Read with", v: d.api }, { k: "Added here", v: d.list.filter((c) => c.mine).length, digits: 0 }]} />}
    />
  );
}

// ---------- Downloads ----------

type DlRec = { count: number; name: string; size: number; type: string; error?: string };

function dlLive(ctx: Ctx) {
  let last: DlRec = { count: 0, name: "", size: 0, type: "" };
  return bind("reach.download", ctx, {
    read: () => last,
    apply: (p) => {
      const type = p.kind === "csv" ? "text/csv" : p.kind === "json" ? "application/json" : "text/plain";
      const blob = new Blob([String(p.text || "")], { type });
      const name = (String(p.name || "note").replace(/[^\w.-]/g, "") || "note") + "." + (p.kind || "txt");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      last = { count: last.count + 1, name, size: blob.size, type };
    },
  });
}

function dlSim(ctx: Ctx) {
  return simulate<DlRec>("reach.download", ctx, { count: 0, name: "", size: 0, type: "" }, (s, p) => ({ count: s.count + 1, name: `${p.name || "note"}.${p.kind || "txt"}`, size: new Blob([String(p.text || "")]).size, type: p.kind || "txt" }));
}

function DlInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<DlRec>(scope, session);
  const [name, setName] = useState("hello");
  const [kind, setKind] = useState("txt");
  const [text, setText] = useState("Made by a web page, no prompt needed.");
  if (!d) return <Frame visual={<Waiting session={session} what="Builds a file in the page and saves it to your Downloads folder." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="After a few downloads in a row Chrome asks whether this site may download multiple files.">
          <textarea className="pc-in pc-ta" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="File contents" disabled={!on} />
          <form className="pc-row" onSubmit={(e) => { e.preventDefault(); send({ name, kind, text }); }}>
            <input className="pc-in pc-short" value={name} onChange={(e) => setName(e.target.value)} aria-label="File name" disabled={!on} />
            <div className="seg">{["txt", "csv", "json"].map((k) => <button key={k} type="button" className={kind === k ? "on" : ""} disabled={!on} onClick={() => setKind(k)}>.{k}</button>)}</div>
            <button className="btn sm pri" disabled={!on}><Download size={13} />Save file</button>
          </form>
        </Panel>
      }
      side={<Readout rows={[{ k: "Files saved", v: d.count, digits: 0, hot: true }, { k: "Last file", v: d.name || "none" }, { k: "Size", v: d.size, u: "bytes", digits: 0 }]} />}
    />
  );
}

// ---------- window.name ----------

type NameRec = { value: string; length: number; original: string; error?: string };

function nameLive(ctx: Ctx) {
  const original = window.name;
  return bind("identity.window-name", ctx, {
    read: (): NameRec => ({ value: window.name, length: window.name.length, original }),
    apply: (p) => { window.name = p.reset ? original : String(p.value ?? ""); },
    watch: (re) => every(1500, re),
    restore: () => { window.name = original; },
  });
}

function nameSim(ctx: Ctx) {
  return simulate<NameRec>("identity.window-name", ctx, { value: "", length: 0, original: "" }, (s, p) => { const v = p.reset ? s.original : String(p.value ?? ""); return { ...s, value: v, length: v.length }; });
}

function NameInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<NameRec>(scope, session);
  const [v, setV] = useState("visitor-7f3a9c");
  if (!d) return <Frame visual={<Waiting session={session} what="Reads the tab's name slot, a string that survives reloads, then writes to it." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="It survives reloads and same site pages in this tab. Modern browsers wipe it when the tab moves to another site, which closed an old tracking trick.">
          <div className="pc-big"><code>{d.value ? short(d.value, 80) : "(empty)"}</code></div>
          <form className="pc-row" onSubmit={(e) => { e.preventDefault(); send({ value: v }); }}>
            <input className="pc-in" value={v} onChange={(e) => setV(e.target.value)} aria-label="New window name" disabled={!on} />
            <button className="btn sm pri" disabled={!on}>Write</button>
            <button className="btn sm" type="button" disabled={!on} onClick={() => send({ reset: true })}>Put back</button>
          </form>
        </Panel>
      }
      side={<Readout rows={[{ k: "Length", v: d.length, u: "chars", digits: 0, hot: true }, { k: "Was at start", v: d.original ? short(d.original, 24) : "empty" }]} />}
    />
  );
}

// ---------- Registry ----------

const base = { passive: true, layer: 1 as const, modes: { detect: "Reads the current value.", create: "Changes it in this tab while it runs; Stop puts it back." } };

export const pageControlScopes: ScopeDef[] = [
  {
    ...base, id: "motion.tab-title", name: "Tab title and icon", domain: "motion", atlas: ["web.actions.tab-title-favicon"], icon: AppWindow,
    summary: "Reads and rewrites this tab's title and icon, adds an unread count and makes the title flash when you look away.",
    call: "document.title = …; link[rel=icon].href = …",
    reveals: ["Whether you are looking at the tab right now", "A way to pull you back with a fake unread count", "Tab disguise: a page can look like your bank or mail once you switch away"],
    live: async (ctx) => tabLive(ctx), sim: tabSim, Instrument: TabInstrument,
  },
  {
    ...base, id: "device.theme-color", name: "Address bar color", domain: "device", atlas: ["web.display.theme-color"], icon: Palette,
    summary: "Reads and changes the color the browser paints its toolbar for this page.",
    call: "meta[name=theme-color].content = …",
    reveals: ["Whether you prefer dark mode", "A way to blend the page into the browser's own toolbar"],
    live: async (ctx) => themeLive(ctx), sim: themeSim, Instrument: ThemeInstrument,
  },
  {
    ...base, id: "reach.address-bar", name: "Address bar URL", domain: "reach", atlas: ["web.actions.history-pushstate", "web.actions.navigation-api"], icon: Link2,
    summary: "Reads the address and back button history, then rewrites the address or adds history entries without loading a page.",
    call: "history.pushState(state, '', url)",
    reveals: ["How many pages you visited in this tab", "A way to trap the back button or show a misleading address on the same site"],
    live: async (ctx) => urlLive(ctx), sim: urlSim, Instrument: UrlInstrument,
  },
  {
    ...base, id: "reach.fullscreen", name: "Fullscreen", domain: "reach", atlas: ["web.actions.fullscreen", "web.display.fullscreen"], icon: Maximize2, gesture: true,
    summary: "Reads screen and window size, then takes the page fullscreen from your click.",
    call: "document.documentElement.requestFullscreen()",
    reveals: ["Your screen size and the space your dock or taskbar takes", "A way to hide the address bar and draw a fake desktop"],
    live: async (ctx) => fsLive(ctx), sim: fsSim, Instrument: FsInstrument,
  },
  {
    ...base, id: "surroundings.read-aloud", name: "Read aloud", domain: "surroundings", atlas: ["web.actions.speech-synthesis"], icon: Volume2,
    summary: "Lists the voices installed on this device and reads your text aloud with any of them.",
    call: "speechSynthesis.speak(new SpeechSynthesisUtterance(text))",
    reveals: ["Your system and installed language packs, from the voice list", "A page can speak out loud without asking"],
    live: async (ctx) => speakLive(ctx), sim: speakSim, Instrument: SpeakInstrument,
  },
  {
    ...base, id: "surroundings.tone", name: "Tone generator", domain: "surroundings", atlas: ["web.actions.web-audio"], icon: AudioWaveform, gesture: true,
    summary: "Opens the audio engine, reads its sample rate and latency, and plays a tone you can shape.",
    call: "new AudioContext().createOscillator()",
    reveals: ["Audio hardware hints from sample rate and latency", "Sound played without any prompt once you click"],
    live: async (ctx) => toneLive(ctx), sim: toneSim, Instrument: ToneInstrument,
  },
  {
    ...base, id: "reach.leave-warning", name: "Leave warning", domain: "reach", atlas: ["web.actions.beforeunload"], icon: DoorOpen,
    summary: "Turns the browser's 'Leave site?' warning on and off for this page.",
    call: "addEventListener('beforeunload', e => e.preventDefault())",
    reveals: ["A way to make leaving a page take an extra click"],
    live: async (ctx) => leaveLive(ctx), sim: leaveSim, Instrument: LeaveInstrument,
  },
  {
    ...base, id: "reach.cookies", name: "Cookies", domain: "reach", atlas: ["web.actions.cookie-store"], icon: Cookie,
    summary: "Lists the cookies scripts can see on this site, then sets and deletes one.",
    call: "cookieStore.getAll(); cookieStore.set(name, value)",
    reveals: ["Analytics and session ids other scripts left here", "A way to tag you for later visits"],
    live: async (ctx) => cookieLive(ctx), sim: cookieSim, Instrument: CookieInstrument,
  },
  {
    ...base, id: "reach.download", name: "Save a file", domain: "reach", atlas: ["web.actions.downloads"], icon: Download, gesture: true,
    summary: "Builds a file inside the page and saves it to your Downloads folder.",
    call: "a.download = name; a.click()",
    reveals: ["A page can drop files on your computer from one click"],
    live: async (ctx) => dlLive(ctx), sim: dlSim, Instrument: DlInstrument,
  },
  {
    ...base, id: "identity.window-name", name: "Tab name slot", domain: "identity", atlas: ["web.storage.window-name"], icon: Tag,
    summary: "Reads and writes window.name, a string that stays with the tab across reloads.",
    call: "window.name = value",
    reveals: ["An id that survives reloads in this tab"],
    live: async (ctx) => nameLive(ctx), sim: nameSim, Instrument: NameInstrument,
  },
];
