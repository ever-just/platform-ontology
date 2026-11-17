import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppWindow, Camera, ClipboardCopy, Clapperboard, Crosshair, DoorClosed, ExternalLink, Focus, Hand, Highlighter, MessageSquareWarning, MousePointer2, Move, PictureInPicture2, Printer, ScreenShare, ScrollText, Smartphone, SquareStack, Navigation, Play, ZoomIn } from "lucide-react";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { every, unsupported } from "../core/harness";
import { Frame, Readout, Waiting } from "../ui/kit";
import { Panel, bind, short, simulate, useCtl } from "./page-controls";
import "./page-controls.css";
import "./page-actions-display.css";

// Display, input and window demos: things a page can do to its own window, pointer, scroll, focus and
// dialogs. Each scope has a trigger, a live readout and a Stop that puts everything back.

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nav = () => navigator as any;
const doc = () => document as any;
const R = (n: number | null | undefined, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "n/a" : String(Math.round(n * 10 ** d) / 10 ** d));
const onoff = (b: boolean) => (b ? "on" : "off");

function Act({ on, onClick, pri, children }: { on: boolean; onClick: () => void; pri?: boolean; children: ReactNode }) {
  return <button type="button" className={"btn sm" + (pri ? " pri" : "")} disabled={!on} onClick={onClick}>{children}</button>;
}
function Tog({ on, checked, onChange, children }: { on: boolean; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label className="pc-sw"><input type="checkbox" checked={checked} disabled={!on} onChange={(e) => onChange(e.target.checked)} />{children}</label>;
}

type Rec = Record<string, any>;

// ---------- Page zoom ----------

function zoomLive(ctx: Ctx) {
  const base = window.devicePixelRatio;
  const st = { cssZoom: 1, blockWheel: false, blockKeys: false, replace: false, noPinch: false, blocked: 0, resizes: 0, lastEvent: "none" };
  const meta0 = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const orig = meta0 ? meta0.content : null;
  let made: HTMLMetaElement | null = null;
  const paint = () => { const e = q("[data-pc-zoom]"); if (e) (e.style as any).zoom = st.cssZoom === 1 ? "" : String(st.cssZoom); };
  const nudge = (dir: number) => { st.cssZoom = dir === 0 ? 1 : clamp(Math.round(st.cssZoom * (dir > 0 ? 1.1 : 1 / 1.1) * 100) / 100, 0.5, 2); paint(); };
  const setMeta = () => {
    let m = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (st.noPinch) {
      if (!m) { m = made = document.createElement("meta"); m.name = "viewport"; document.head.appendChild(m); }
      m.content = (orig || "width=device-width, initial-scale=1").replace(/,?\s*(maximum-scale|user-scalable)=[^,]*/g, "") + ", maximum-scale=1, user-scalable=no";
    } else if (m) {
      if (made) { made.remove(); made = null; } else m.content = orig || "";
    }
  };
  let re = () => {};
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey || !(st.blockWheel || st.replace)) return;
    e.preventDefault();
    st.blocked++;
    st.lastEvent = `Ctrl+wheel ${e.deltaY < 0 ? "in" : "out"} ${st.replace ? "replaced by page zoom" : "blocked"}`;
    if (st.replace) nudge(e.deltaY < 0 ? 1 : -1);
    re();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !(st.blockKeys || st.replace)) return;
    const dir = ["+", "="].includes(e.key) ? 1 : ["-", "_"].includes(e.key) ? -1 : e.key === "0" ? 0 : null;
    if (dir === null) return;
    e.preventDefault();
    st.blocked++;
    st.lastEvent = `${e.ctrlKey ? "Ctrl" : "Cmd"}+${e.key} ${st.replace ? "replaced by page zoom" : "blocked"}`;
    if (st.replace) nudge(dir);
    re();
  };
  const onGesture = (e: Event) => { if (st.noPinch) { e.preventDefault(); st.blocked++; st.lastEvent = "pinch gesture blocked"; re(); } };
  return bind("device.page-zoom", ctx, {
    read: (): Rec => {
      const vv = window.visualViewport;
      return {
        dpr: window.devicePixelRatio, base, rel: window.devicePixelRatio / base, vv: vv ? vv.scale : null, inner: `${innerWidth} × ${innerHeight}`, outer: `${outerWidth} × ${outerHeight}`,
        cssSupported: CSS.supports("zoom", "1.2"), meta: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content || "none", ...st,
      };
    },
    apply: (p) => {
      if (p.reset) { Object.assign(st, { cssZoom: 1, blockWheel: false, blockKeys: false, replace: false, noPinch: false }); setMeta(); paint(); return; }
      if (p.key) { (st as any)[p.key] = p.value; if (p.key === "noPinch") setMeta(); }
      if (typeof p.cssZoom === "number") { st.cssZoom = clamp(p.cssZoom, 0.5, 2); paint(); }
    },
    watch: (r) => {
      re = r;
      const rs = () => { st.resizes++; r(); };
      addEventListener("wheel", onWheel, { passive: false, capture: true });
      addEventListener("keydown", onKey, true);
      addEventListener("resize", rs);
      addEventListener("gesturestart", onGesture); addEventListener("gesturechange", onGesture);
      window.visualViewport?.addEventListener("resize", rs);
      return () => {
        removeEventListener("wheel", onWheel, true); removeEventListener("keydown", onKey, true); removeEventListener("resize", rs);
        removeEventListener("gesturestart", onGesture); removeEventListener("gesturechange", onGesture);
        window.visualViewport?.removeEventListener("resize", rs);
      };
    },
    restore: () => { st.noPinch = false; setMeta(); const e = q("[data-pc-zoom]"); if (e) (e.style as any).zoom = ""; },
  });
}

const zoomSim = (ctx: Ctx) => simulate<Rec>("device.page-zoom", ctx, { dpr: 2, base: 2, rel: 1, vv: 1, inner: "1280 × 760", outer: "1440 × 900", cssSupported: true, meta: "width=device-width", cssZoom: 1, blockWheel: false, blockKeys: false, replace: false, noPinch: false, blocked: 0, resizes: 0, lastEvent: "none" }, (s, p) => {
  if (p.reset) return { ...s, cssZoom: 1, blockWheel: false, blockKeys: false, replace: false, noPinch: false };
  const n = { ...s };
  if (p.key) { n[p.key] = p.value; if (p.key === "noPinch") n.meta = p.value ? "width=device-width, maximum-scale=1, user-scalable=no" : "width=device-width"; }
  if (typeof p.cssZoom === "number") n.cssZoom = p.cssZoom;
  return n;
});

function ZoomInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Reads how zoomed this page is, zooms a box of its own, and can swallow the zoom shortcuts." />} />;
  const set = (key: string) => (value: boolean) => send({ key, value });
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="A page cannot set the browser zoom itself; it can only react to it, restyle its own content or take over the shortcuts. Stop turns every override off.">
          <div className="pd-zoom"><div data-pc-zoom className="pd-zoom-box"><b>Zoomable box</b><span>Hold Ctrl and scroll here, or press Ctrl plus and minus. With a block on, the browser zoom does nothing.</span></div></div>
          <div className="pc-row">
            <Tog on={on} checked={d.blockWheel} onChange={set("blockWheel")}>Block Ctrl+wheel</Tog>
            <Tog on={on} checked={d.blockKeys} onChange={set("blockKeys")}>Block Ctrl plus, minus, zero</Tog>
            <Tog on={on} checked={d.replace} onChange={set("replace")}>Replace with zoom of the box</Tog>
            <Tog on={on} checked={d.noPinch} onChange={set("noPinch")}>Block pinch (viewport meta)</Tog>
          </div>
          <div className="pc-row">
            <label className="pc-rng">Box zoom<input type="range" min={50} max={200} step={5} value={Math.round(d.cssZoom * 100)} disabled={!on} onChange={(e) => send({ cssZoom: +e.target.value / 100 })} /><b>{Math.round(d.cssZoom * 100)}%</b></label>
            <Act on={on} onClick={() => send({ reset: true })}>Put back</Act>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Pixel ratio", v: R(d.dpr), hot: true },
        { k: "Zoom since start", v: R(d.rel * 100, 0), u: "%" },
        { k: "Pinch scale", v: d.vv === null ? "no API" : R(d.vv) },
        { k: "Window inner", v: d.inner },
        { k: "Window outer", v: d.outer },
        { k: "Resize events", v: d.resizes, digits: 0 },
        { k: "Zoom attempts stopped", v: d.blocked, digits: 0 },
        { k: "Last", v: d.lastEvent },
        { k: "CSS zoom works", v: d.cssSupported ? "yes" : "no" },
        { k: "Viewport meta", v: short(d.meta, 44) },
      ]} />}
    />
  );
}

// ---------- Custom cursor ----------

const CURSORS = ["default", "crosshair", "grab", "wait", "not-allowed", "none", "image"];

function cursorImage(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  if (!g) return "";
  g.strokeStyle = "#e03131"; g.lineWidth = 2;
  g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.moveTo(16, 1); g.lineTo(16, 31); g.moveTo(1, 16); g.lineTo(31, 16); g.stroke();
  return c.toDataURL("image/png");
}

function cursorLive(ctx: Ctx) {
  const img = cursorImage();
  const st = { kind: "default", inside: false, x: 0, y: 0, moves: 0, pointer: "none" };
  const el = () => q("[data-pc-cursor]");
  const paint = () => { const e = el(); if (e) e.style.cursor = st.kind === "default" ? "" : st.kind === "image" ? `url(${img}) 16 16, crosshair` : st.kind; };
  let last = 0;
  let re = () => {};
  const mv = (e: PointerEvent) => {
    const e0 = el();
    if (!e0) return;
    const r = e0.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    st.pointer = e.pointerType;
    if (inside) { st.x = Math.round(e.clientX - r.left); st.y = Math.round(e.clientY - r.top); st.moves++; }
    if (inside !== st.inside || (inside && performance.now() - last > 120)) { st.inside = inside; last = performance.now(); re(); }
  };
  return bind("device.custom-cursor", ctx, {
    read: (): Rec => ({ ...st, computed: el() ? short(getComputedStyle(el()!).cursor, 36) : "n/a", coarse: matchMedia("(pointer: coarse)").matches, canHover: matchMedia("(hover: hover)").matches }),
    apply: (p) => { st.kind = p.reset ? "default" : String(p.kind); paint(); },
    watch: (r) => { re = r; addEventListener("pointermove", mv); return () => removeEventListener("pointermove", mv); },
    restore: () => { const e = el(); if (e) e.style.cursor = ""; },
  });
}

const cursorSim = (ctx: Ctx) => simulate<Rec>("device.custom-cursor", ctx, { kind: "default", inside: false, x: 0, y: 0, moves: 0, pointer: "mouse", computed: "auto", coarse: false, canHover: true }, (s, p) => ({ ...s, kind: p.reset ? "default" : p.kind, computed: p.reset ? "auto" : p.kind }));

function CursorInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Swaps or hides the mouse pointer inside a box on this page." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="The pointer only changes inside the page. Touch screens have no pointer, so they ignore it.">
          <div data-pc-cursor className="pd-pad"><b>Move your mouse in here</b><span>{d.kind === "none" ? "The pointer is hidden" : d.kind === "image" ? "The pointer is a picture the page drew" : "Pick a pointer below"}</span></div>
          <div className="pc-row"><span className="pc-l">Pointer</span><div className="seg">{CURSORS.map((k) => <button key={k} type="button" className={d.kind === k ? "on" : ""} disabled={!on} onClick={() => send({ kind: k })}>{k === "image" ? "custom image" : k === "none" ? "hidden" : k}</button>)}</div></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Pointer now", v: d.kind, hot: true },
        { k: "Browser reports", v: d.computed },
        { k: "Inside the box", v: d.inside ? "yes" : "no" },
        { k: "Position", v: `${d.x}, ${d.y}` },
        { k: "Moves seen", v: d.moves, digits: 0 },
        { k: "Input type", v: d.pointer },
        { k: "Can hover", v: d.canHover ? "yes" : "no" },
        { k: "Touch first", v: d.coarse ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Scroll control ----------

function scrollLive(ctx: Ctx) {
  const st = { mode: "free", contain: false, snap: false, wheels: 0, hijacked: 0 };
  const el = () => q("[data-pc-scroll]");
  const paint = () => {
    const e = el();
    if (!e) return;
    e.style.overscrollBehavior = st.contain ? "contain" : "";
    e.style.scrollSnapType = st.snap ? "y mandatory" : "";
    e.dataset.snap = st.snap ? "on" : "off";
    e.style.overflowY = st.mode === "locked" ? "hidden" : "";
  };
  let re = () => {};
  const wheel = (e: WheelEvent) => {
    const e0 = el();
    if (!e0 || !(e.target as Element)?.closest?.("[data-pc-scroll]")) return;
    st.wheels++;
    if (st.mode === "slow") { e.preventDefault(); e0.scrollTop += e.deltaY * 0.2; st.hijacked++; }
    else if (st.mode === "locked") { e.preventDefault(); st.hijacked++; }
    re();
  };
  return bind("device.scroll-control", ctx, {
    read: (): Rec => {
      const e = el();
      const max = e ? e.scrollHeight - e.clientHeight : 0;
      return { ...st, top: e ? Math.round(e.scrollTop) : 0, max, pct: max ? Math.round((e!.scrollTop / max) * 100) : 0, behavior: e ? getComputedStyle(e).scrollBehavior : "auto" };
    },
    apply: (p) => {
      const e = el();
      if (p.reset) { Object.assign(st, { mode: "free", contain: false, snap: false }); paint(); e?.scrollTo({ top: 0 }); return; }
      if (p.mode) st.mode = p.mode;
      if (typeof p.contain === "boolean") st.contain = p.contain;
      if (typeof p.snap === "boolean") st.snap = p.snap;
      paint();
      if (p.to && e) e.scrollTo({ top: p.to === "top" ? 0 : e.scrollHeight, behavior: "smooth" });
    },
    watch: (r) => {
      re = r;
      document.addEventListener("wheel", wheel, { passive: false, capture: true });
      document.addEventListener("scroll", r, true);
      return () => { document.removeEventListener("wheel", wheel, true); document.removeEventListener("scroll", r, true); };
    },
    restore: () => { const e = el(); if (e) { e.style.overscrollBehavior = ""; e.style.scrollSnapType = ""; e.style.overflowY = ""; delete e.dataset.snap; } },
  });
}

const scrollSim = (ctx: Ctx) => simulate<Rec>("device.scroll-control", ctx, { mode: "free", contain: false, snap: false, wheels: 0, hijacked: 0, top: 0, max: 600, pct: 0, behavior: "auto" }, (s, p) => {
  if (p.reset) return { ...s, mode: "free", contain: false, snap: false, top: 0, pct: 0 };
  const n = { ...s };
  if (p.mode) n.mode = p.mode;
  if (typeof p.contain === "boolean") n.contain = p.contain;
  if (typeof p.snap === "boolean") n.snap = p.snap;
  if (p.to) { n.top = p.to === "top" ? 0 : s.max; n.pct = p.to === "top" ? 0 : 100; }
  return n;
});

function ScrollInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Scrolls a box for you, slows or locks its wheel, and snaps it into place." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="A page can scroll itself, slow your wheel to a crawl or lock it. Browsers keep scrollbars and touch drags working in most cases.">
          <div data-pc-scroll className="pd-scroll">{Array.from({ length: 14 }, (_, i) => <p key={i}><b>Section {i + 1}</b> Scroll with the wheel to feel what the page decided.</p>)}</div>
          <div className="pc-row">
            <Act on={on} pri onClick={() => send({ to: "bottom" })}>Scroll to the end</Act>
            <Act on={on} onClick={() => send({ to: "top" })}>Back to top</Act>
            <span className="pc-l">Wheel</span>
            <div className="seg">{[["free", "Normal"], ["slow", "Slowed"], ["locked", "Locked"]].map(([k, l]) => <button key={k} type="button" className={d.mode === k ? "on" : ""} disabled={!on} onClick={() => send({ mode: k })}>{l}</button>)}</div>
          </div>
          <div className="pc-row">
            <Tog on={on} checked={d.contain} onChange={(v) => send({ contain: v })}>Keep scroll inside the box</Tog>
            <Tog on={on} checked={d.snap} onChange={(v) => send({ snap: v })}>Snap to sections</Tog>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Position", v: `${d.top} of ${d.max}`, hot: true },
        { k: "Scrolled", v: d.pct, u: "%", digits: 0 },
        { k: "Wheel mode", v: d.mode },
        { k: "Wheel turns seen", v: d.wheels, digits: 0 },
        { k: "Turns the page changed", v: d.hijacked, digits: 0 },
        { k: "Snap", v: onoff(d.snap) },
        { k: "Overscroll contained", v: onoff(d.contain) },
        { k: "Smooth scroll css", v: d.behavior },
      ]} />}
    />
  );
}

// ---------- Move and resize own window ----------

function winLive(ctx: Ctx) {
  if (typeof window.open !== "function") unsupported("window.open");
  const own0 = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
  let pop: Window | null = null;
  const st = { blocked: false, own: "not tried" };
  const geo = (w: Window | null) => { try { return w && !w.closed ? { x: w.screenX, y: w.screenY, w: w.outerWidth, h: w.outerHeight } : null; } catch { return null; } };
  return bind("device.window-move-resize", ctx, {
    read: (): Rec => ({ popup: geo(pop), open: !!geo(pop), own: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight }, ownResult: st.own, blocked: st.blocked, canMove: typeof window.moveTo === "function" }),
    apply: async (p) => {
      if (p.op === "open") {
        pop?.close();
        pop = window.open("about:blank", "pc_move_demo", `popup=yes,width=360,height=240,left=${Math.round(window.screenX + 80)},top=${Math.round(window.screenY + 120)}`);
        st.blocked = !pop;
        if (!pop) throw new DOMException("The browser blocked the popup", "NotAllowedError");
        pop.document.title = "Move and resize demo";
        pop.document.body.style.cssText = "font:14px system-ui;padding:16px";
        pop.document.body.textContent = "This small window was opened by the page, so the page may move and resize it.";
        return;
      }
      if (p.op === "ownTry") {
        const b = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
        window.moveBy(60, 40); window.resizeBy(-80, -60);
        await wait(300);
        const a = { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight };
        st.own = b.x === a.x && b.y === a.y && b.w === a.w && b.h === a.h ? "ignored by the browser" : "this window moved";
        return;
      }
      if (!pop || pop.closed) throw new DOMException("Open the popup first", "InvalidStateError");
      if (p.op === "close") { pop.close(); return; }
      const [a, b] = [p.a as number, p.b as number];
      if (p.op === "moveTo") pop.moveTo(a, b);
      if (p.op === "moveBy") pop.moveBy(a, b);
      if (p.op === "resizeTo") pop.resizeTo(a, b);
      if (p.op === "resizeBy") pop.resizeBy(a, b);
    },
    watch: (re) => every(700, re),
    restore: () => {
      try { pop?.close(); } catch { /* best effort */ }
      if (st.own === "this window moved") { window.moveTo(own0.x, own0.y); window.resizeTo(own0.w, own0.h); }
    },
  });
}

const winSim = (ctx: Ctx) => simulate<Rec>("device.window-move-resize", ctx, { popup: null, open: false, own: { x: 0, y: 25, w: 1440, h: 900 }, ownResult: "not tried", blocked: false, canMove: true }, (s, p) => {
  const n = { ...s };
  if (p.op === "open") { n.popup = { x: 80, y: 145, w: 360, h: 240 }; n.open = true; }
  else if (p.op === "ownTry") n.ownResult = "ignored by the browser";
  else if (n.popup) {
    if (p.op === "close") { n.popup = null; n.open = false; }
    if (p.op === "moveTo") n.popup = { ...n.popup, x: p.a, y: p.b };
    if (p.op === "moveBy") n.popup = { ...n.popup, x: n.popup.x + p.a, y: n.popup.y + p.b };
    if (p.op === "resizeTo") n.popup = { ...n.popup, w: p.a, h: p.b };
    if (p.op === "resizeBy") n.popup = { ...n.popup, w: n.popup.w + p.a, h: n.popup.h + p.b };
  }
  return n;
});

function WinInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Opens a small window and moves and resizes it from script, then tries the same on this tab." />} />;
  const p = d.popup as Rec | null;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Allow popups for this site if the browser blocks it. Browsers only let a page move or resize a window it opened itself.">
          <div className="pc-row">
            <Act on={on} pri onClick={() => send({ op: "open" })}>Open popup</Act>
            <Act on={on && d.open} onClick={() => send({ op: "moveBy", a: 60, b: 30 })}>Move by 60, 30</Act>
            <Act on={on && d.open} onClick={() => send({ op: "moveTo", a: 100, b: 100 })}>Move to 100, 100</Act>
            <Act on={on && d.open} onClick={() => send({ op: "resizeBy", a: 80, b: 40 })}>Grow</Act>
            <Act on={on && d.open} onClick={() => send({ op: "resizeTo", a: 360, b: 240 })}>Reset size</Act>
            <Act on={on && d.open} onClick={() => send({ op: "close" })}>Close popup</Act>
          </div>
          <div className="pc-row"><Act on={on} onClick={() => send({ op: "ownTry" })}>Try moving this tab instead</Act><span className="pc-l">{d.ownResult}</span></div>
          <div className="pd-stage"><div className="pd-mini" style={p ? { left: clamp((p.x / 2200) * 100, 0, 80) + "%", top: clamp((p.y / 1300) * 100, 0, 75) + "%", width: clamp((p.w / 2200) * 100, 8, 60) + "%", height: clamp((p.h / 1300) * 100, 8, 60) + "%" } : { display: "none" }}>popup</div></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Popup", v: d.open ? "open" : "closed", hot: true },
        { k: "Popup position", v: p ? `${p.x}, ${p.y}` : "none" },
        { k: "Popup size", v: p ? `${p.w} × ${p.h}` : "none" },
        { k: "This tab position", v: `${d.own.x}, ${d.own.y}` },
        { k: "This tab size", v: `${d.own.w} × ${d.own.h}` },
        { k: "Moving this tab", v: d.ownResult },
        { k: "Popup blocked", v: d.blocked ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Screen orientation lock ----------

function orientLive(ctx: Ctx) {
  const so = screen.orientation as any;
  if (!so || typeof so.lock !== "function") unsupported("Screen Orientation lock");
  const st = { locked: "none", entered: false };
  return bind("device.orientation-lock", ctx, {
    read: (): Rec => ({ type: so.type, angle: so.angle, locked: st.locked, fullscreen: !!document.fullscreenElement, portrait: matchMedia("(orientation: portrait)").matches, entered: st.entered }),
    apply: async (p) => {
      if (p.op === "unlock") { so.unlock(); st.locked = "none"; if (st.entered && document.fullscreenElement) await document.exitFullscreen(); st.entered = false; return; }
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) { await document.documentElement.requestFullscreen(); st.entered = true; }
      await so.lock(p.type);
      st.locked = p.type;
    },
    watch: (re) => { so.addEventListener("change", re); document.addEventListener("fullscreenchange", re); return () => { so.removeEventListener("change", re); document.removeEventListener("fullscreenchange", re); }; },
    restore: () => { try { so.unlock(); } catch { /* best effort */ } if (st.entered && document.fullscreenElement) document.exitFullscreen().catch(() => {}); },
  });
}

const orientSim = (ctx: Ctx) => simulate<Rec>("device.orientation-lock", ctx, { type: "portrait-primary", angle: 0, locked: "none", fullscreen: false, portrait: true, entered: false }, (s, p) => p.op === "unlock" ? { ...s, locked: "none", fullscreen: false } : { ...s, locked: p.type, type: p.type === "any" ? s.type : p.type === "landscape" ? "landscape-primary" : p.type, portrait: !String(p.type).startsWith("landscape"), fullscreen: true, angle: String(p.type).startsWith("landscape") ? 90 : 0 });

const LOCKS = ["portrait", "landscape", "portrait-primary", "landscape-primary", "natural"];

function OrientInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Reads portrait or landscape, then asks the screen to stay in one." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Most browsers only allow the lock in fullscreen on a phone or tablet, so this goes fullscreen first. Desktop screens refuse. Stop unlocks and leaves fullscreen.">
          <div className={"pd-phone " + (d.portrait ? "p" : "l")}><span>{d.type}</span><b>{d.angle}°</b></div>
          <div className="pc-row"><span className="pc-l">Lock to</span><div className="seg">{LOCKS.map((k) => <button key={k} type="button" className={d.locked === k ? "on" : ""} disabled={!on} onClick={() => send({ op: "lock", type: k })}>{k}</button>)}</div></div>
          <div className="pc-row"><Act on={on} onClick={() => send({ op: "unlock" })}>Unlock</Act></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Orientation", v: d.type, hot: true },
        { k: "Angle", v: d.angle, u: "deg", digits: 0 },
        { k: "Locked to", v: d.locked },
        { k: "Fullscreen", v: d.fullscreen ? "yes" : "no" },
        { k: "Portrait", v: d.portrait ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Picture in picture (video and camera) ----------

function demoStream(): { stream: MediaStream; stop: () => void } {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  if (typeof (c as any).captureStream !== "function") unsupported("canvas.captureStream");
  const g = c.getContext("2d")!;
  let n = 0;
  const draw = () => {
    n++;
    g.fillStyle = "#1c2541"; g.fillRect(0, 0, 320, 180);
    g.fillStyle = "#5bc0be"; g.beginPath(); g.arc(160 + Math.cos(n / 12) * 90, 90 + Math.sin(n / 9) * 40, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.font = "600 15px system-ui"; g.fillText("Page-made video " + (n % 1000), 12, 24);
  };
  draw();
  const h = setInterval(draw, 40);
  return { stream: (c as any).captureStream(25), stop: () => clearInterval(h) };
}

function pipBind(id: string, ctx: Ctx, key: string, stream: MediaStream, extraStop: () => void): Stop {
  if (!doc().pictureInPictureEnabled) { extraStop(); unsupported("Picture in Picture"); }
  const st = { enters: 0, leaves: 0, auto: false, w: 0, h: 0, error: "" };
  const el = () => q<HTMLVideoElement>(`video[data-pc-pip="${key}"]`);
  const ready = async () => {
    const v = el();
    if (!v) throw new DOMException("The video is not on screen yet", "InvalidStateError");
    if (v.srcObject !== stream) { v.srcObject = stream; v.muted = true; }
    await v.play();
    return v;
  };
  let re = () => {};
  const enter = (e: any) => { st.enters++; st.w = e.pictureInPictureWindow?.width || 0; st.h = e.pictureInPictureWindow?.height || 0; e.pictureInPictureWindow?.addEventListener?.("resize", (r: any) => { st.w = r.target.width; st.h = r.target.height; re(); }); re(); };
  const leave = () => { st.leaves++; st.w = st.h = 0; re(); };
  const stop = bind(id, ctx, {
    read: (): Rec => {
      const v = el();
      return { supported: true, active: !!doc().pictureInPictureElement, enters: st.enters, leaves: st.leaves, auto: st.auto, w: st.w, h: st.h, playing: !!v && !v.paused, track: stream.getVideoTracks()[0]?.label || "page canvas", autoApi: v ? "autoPictureInPicture" in v : false };
    },
    apply: async (p) => {
      const v = await ready();
      if (p.op === "enter") await (v as any).requestPictureInPicture();
      if (p.op === "exit" && doc().pictureInPictureElement) await doc().exitPictureInPicture();
      if (p.op === "auto") {
        st.auto = !!p.value;
        (v as any).autoPictureInPicture = st.auto;
        try { nav().mediaSession?.setActionHandler("enterpictureinpicture", st.auto ? () => { (v as any).requestPictureInPicture().catch(() => {}); } : null); } catch { /* action not supported here */ }
      }
    },
    watch: (r) => { re = r; document.addEventListener("enterpictureinpicture", enter, true); document.addEventListener("leavepictureinpicture", leave, true); return () => { document.removeEventListener("enterpictureinpicture", enter, true); document.removeEventListener("leavepictureinpicture", leave, true); }; },
    restore: () => {
      if (doc().pictureInPictureElement) doc().exitPictureInPicture().catch(() => {});
      try { nav().mediaSession?.setActionHandler("enterpictureinpicture", null); } catch { /* ignore */ }
      const v = el(); if (v) v.srcObject = null;
      extraStop();
    },
  });
  return stop;
}

const videoPipLive = (ctx: Ctx) => { const { stream, stop } = demoStream(); return pipBind("device.video-pip", ctx, "video", stream, stop); };
const cameraPipLive = async (ctx: Ctx) => {
  if (!nav().mediaDevices?.getUserMedia) unsupported("Camera access");
  const stream: MediaStream = await nav().mediaDevices.getUserMedia({ video: { width: 640 } });
  ctx.setMedia(stream);
  return pipBind("capture.camera-pip", ctx, "camera", stream, () => stream.getTracks().forEach((t) => t.stop()));
};
const pipSim = (id: string) => (ctx: Ctx) => simulate<Rec>(id, ctx, { supported: true, active: false, enters: 0, leaves: 0, auto: false, w: 0, h: 0, playing: false, track: "simulated", autoApi: true }, (s, p) => {
  if (p.op === "enter") return { ...s, active: true, enters: s.enters + 1, w: 400, h: 225, playing: true };
  if (p.op === "exit") return { ...s, active: false, leaves: s.leaves + 1, w: 0, h: 0 };
  if (p.op === "auto") return { ...s, auto: !!p.value };
  return s;
});

function PipInstrument(key: "video" | "camera", what: string) {
  return function Pip({ scope, session }: InstrumentProps) {
    const { d, on, sim, send } = useCtl<Rec>(scope, session);
    if (!d) return <Frame visual={<Waiting session={session} what={what} />} />;
    return (
      <Frame
        visual={
          <Panel on={on} sim={sim} error={d.error} note={key === "camera" ? "The camera light stays on while it floats above other apps. Stop closes the window and turns the camera off." : "The floating window stays above other apps. Stop closes it."}>
            <div className="pd-video">{sim ? <div className="pd-fake">simulated video</div> : <video data-pc-pip={key} muted playsInline autoPlay />}{d.active && <span className="pd-badge">floating</span>}</div>
            <div className="pc-row">
              <Act on={on && !d.active} pri onClick={() => send({ op: "enter" })}>Float the video</Act>
              <Act on={on && d.active} onClick={() => send({ op: "exit" })}>Bring it back</Act>
              <Tog on={on} checked={d.auto} onChange={(v) => send({ op: "auto", value: v })}>Float automatically when I switch tabs</Tog>
            </div>
          </Panel>
        }
        side={<Readout rows={[
          { k: "Floating now", v: d.active ? "yes" : "no", hot: true },
          { k: "Window size", v: d.w ? `${d.w} × ${d.h}` : "none" },
          { k: "Times floated", v: d.enters, digits: 0 },
          { k: "Times closed", v: d.leaves, digits: 0 },
          { k: "Video playing", v: d.playing ? "yes" : "no" },
          { k: "Source", v: short(String(d.track), 32) },
          { k: "Auto mode", v: onoff(d.auto) },
          { k: "Auto attribute", v: d.autoApi ? "present" : "missing" },
        ]} />}
      />
    );
  };
}

// ---------- Copy event ----------

function copyLive(ctx: Ctx) {
  const st = { mode: "off", copies: 0, selected: "", written: "none yet" };
  let re = () => {};
  const inBox = (n: Node | null) => !!(n && (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest("[data-pc-copy]"));
  const on = (e: ClipboardEvent) => {
    const s = getSelection();
    if (!s || !inBox(s.anchorNode)) return;
    const text = String(s);
    st.copies++; st.selected = text;
    if (st.mode === "off") st.written = "(your text, unchanged)";
    else {
      st.written = st.mode === "append" ? `${text}\n\nRead more at https://example.com/ad?src=copy` : st.mode === "replace" ? "Something else entirely." : "";
      e.clipboardData?.setData("text/plain", st.written);
      e.preventDefault();
      if (e.type === "cut") return re();
    }
    re();
  };
  return bind("capture.copy-event", ctx, {
    read: (): Rec => ({ ...st, selected: short(st.selected, 80) }),
    apply: (p) => {
      if (p.mode) st.mode = p.mode;
      if (p.op === "copy") {
        const box = q("[data-pc-copy]");
        if (!box) return;
        const r = document.createRange(); r.selectNodeContents(box);
        const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);
        document.execCommand("copy");
      }
    },
    watch: (r) => { re = r; document.addEventListener("copy", on, true); document.addEventListener("cut", on, true); return () => { document.removeEventListener("copy", on, true); document.removeEventListener("cut", on, true); }; },
    restore: () => { st.mode = "off"; },
  });
}

const copySim = (ctx: Ctx) => simulate<Rec>("capture.copy-event", ctx, { mode: "off", copies: 0, selected: "", written: "none yet" }, (s, p) => {
  const n = { ...s };
  if (p.mode) n.mode = p.mode;
  if (p.op === "copy") { n.copies++; n.selected = "Meet at the north gate at 9."; n.written = n.mode === "off" ? "(your text, unchanged)" : n.mode === "append" ? n.selected + "\n\nRead more at https://example.com/ad?src=copy" : n.mode === "replace" ? "Something else entirely." : ""; }
  return n;
});

function CopyInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Listens for copy and cut in a text box and changes what lands on your clipboard." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Select the text yourself and press Ctrl or Cmd C, or use the button. Paste into the box below to see what the clipboard really holds.">
          <div data-pc-copy className="pd-pad"><b>Meet at the north gate at 9.</b></div>
          <div className="pc-row">
            <span className="pc-l">On copy</span>
            <div className="seg">{[["off", "Leave alone"], ["append", "Add a link"], ["replace", "Swap the text"], ["block", "Empty it"]].map(([k, l]) => <button key={k} type="button" className={d.mode === k ? "on" : ""} disabled={!on} onClick={() => send({ mode: k })}>{l}</button>)}</div>
            <Act on={on} pri onClick={() => send({ op: "copy" })}>Copy the text</Act>
          </div>
          <textarea className="pc-in pc-ta" rows={3} placeholder="Paste here to see what you copied" aria-label="Paste test" />
        </Panel>
      }
      side={<Readout rows={[
        { k: "Rewrite mode", v: d.mode, hot: true },
        { k: "Copies seen", v: d.copies, digits: 0 },
        { k: "You selected", v: d.selected || "nothing" },
        { k: "Clipboard got", v: short(String(d.written), 80) },
      ]} />}
    />
  );
}

// ---------- Drag and drop ----------

function dragLive(ctx: Ctx) {
  const st = { drags: 0, drops: 0, over: false, types: "none", dropped: [] as string[], files: [] as { name: string; size: number; type: string }[] };
  let re = () => {};
  const zone = (t: EventTarget | null) => (t as Element | null)?.closest?.("[data-pc-drop]");
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const start = (e: DragEvent) => {
    const it = (e.target as Element | null)?.closest?.("[data-pc-drag-item]");
    if (!it || !e.dataTransfer) return;
    e.dataTransfer.setData("text/plain", it.textContent || "");
    e.dataTransfer.effectAllowed = "move";
    st.drags++; st.types = [...e.dataTransfer.types].join(", ");
    re();
  };
  const over = (e: DragEvent) => {
    const z = zone(e.target);
    if (z || hasFiles(e)) e.preventDefault();
    if (z && e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const was = st.over; st.over = !!z; if (was !== st.over) re();
  };
  const leave = (e: DragEvent) => { if (zone(e.target) && !zone(e.relatedTarget)) { st.over = false; re(); } };
  const drop = (e: DragEvent) => {
    if (!zone(e.target)) { if (hasFiles(e)) e.preventDefault(); return; }
    e.preventDefault();
    const dt = e.dataTransfer!;
    st.drops++; st.over = false; st.types = [...dt.types].join(", ") || "none";
    const text = dt.getData("text/plain");
    if (text) st.dropped = [...st.dropped, text].slice(-6);
    st.files = [...dt.files].map((f) => ({ name: f.name, size: f.size, type: f.type || "unknown" }));
    re();
  };
  return bind("motion.drag-and-drop", ctx, {
    read: (): Rec => ({ ...st, files: st.files.slice(0, 5) }),
    apply: (p) => { if (p.reset) { st.dropped = []; st.files = []; st.drags = 0; st.drops = 0; st.types = "none"; } },
    watch: (r) => {
      re = r;
      const pairs: [string, any][] = [["dragstart", start], ["dragenter", over], ["dragover", over], ["dragleave", leave], ["drop", drop]];
      pairs.forEach(([n, f]) => document.addEventListener(n, f, true));
      return () => pairs.forEach(([n, f]) => document.removeEventListener(n, f, true));
    },
  });
}

const dragSim = (ctx: Ctx) => simulate<Rec>("motion.drag-and-drop", ctx, { drags: 0, drops: 0, over: false, types: "none", dropped: [], files: [] }, (s, p) => p.reset ? { ...s, drags: 0, drops: 0, dropped: [], files: [], types: "none" } : s);

const CHIPS = ["Invoice.pdf", "Holiday photo", "Draft note"];

function DragInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Lets you drag items onto a drop box, and shows what a page learns when you drop a file from your desktop." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note={sim ? "Dragging does nothing in simulated mode." : "A page sees the names, sizes and types of dropped files, but not their folders. Dropping a file outside the box is ignored."}>
          <div className="pc-row">{CHIPS.map((c) => <span key={c} className="pd-chip" draggable data-pc-drag-item>{c}</span>)}</div>
          <div data-pc-drop className={"pd-drop" + (d.over ? " over" : "")}>{d.dropped.length ? d.dropped.map((x: string, i: number) => <span key={i} className="pd-chip">{x}</span>) : <span>Drop a chip here, or a file from your desktop</span>}</div>
          <div className="pc-row"><Act on={on} onClick={() => send({ reset: true })}>Clear</Act></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Drags started", v: d.drags, digits: 0 },
        { k: "Drops received", v: d.drops, digits: 0, hot: true },
        { k: "Over the box", v: d.over ? "yes" : "no" },
        { k: "Data kinds", v: short(d.types, 40) },
        { k: "Files dropped", v: d.files.length, digits: 0 },
        ...d.files.map((f: Rec, i: number) => ({ k: `File ${i + 1}`, v: `${short(f.name, 22)} · ${f.size} bytes · ${f.type}` })),
      ]} />}
    />
  );
}

// ---------- Focus stealing ----------

function focusLive(ctx: Ctx) {
  const st = { stolen: 0, loop: false, pending: false, focusEv: 0, blurEv: 0, winFocus: "not tried" };
  let t = 0, loop = 0;
  let re = () => {};
  const el = () => q<HTMLInputElement>("[data-pc-focus-target]");
  const steal = () => {
    const e = el();
    if (!e) return;
    const before = document.activeElement;
    e.focus();
    if (document.activeElement === e && before !== e) st.stolen++;
    st.pending = false; re();
  };
  const label = () => { const a = document.activeElement as HTMLElement | null; return a ? (a.getAttribute("aria-label") || a.tagName.toLowerCase()) : "none"; };
  return bind("reach.focus-stealing", ctx, {
    read: (): Rec => ({ ...st, hasFocus: document.hasFocus(), active: label() }),
    apply: (p) => {
      if (p.op === "steal") { st.pending = true; clearTimeout(t); t = window.setTimeout(steal, 3000); }
      if (p.op === "loop") { st.loop = !!p.value; clearInterval(loop); if (st.loop) loop = window.setInterval(steal, 2000); }
      if (p.op === "win") { const b = document.hasFocus(); window.focus(); st.winFocus = b ? "already had focus" : document.hasFocus() ? "took focus" : "browser refused"; }
    },
    watch: (r) => { re = r; const fi = () => { st.focusEv++; r(); }; const fo = () => { st.blurEv++; r(); }; document.addEventListener("focusin", fi); document.addEventListener("focusout", fo); addEventListener("focus", r); addEventListener("blur", r); const poll = every(1000, r); return () => { document.removeEventListener("focusin", fi); document.removeEventListener("focusout", fo); removeEventListener("focus", r); removeEventListener("blur", r); poll(); }; },
    restore: () => { clearTimeout(t); clearInterval(loop); el()?.blur(); },
  });
}

const focusSim = (ctx: Ctx) => simulate<Rec>("reach.focus-stealing", ctx, { stolen: 0, loop: false, pending: false, focusEv: 0, blurEv: 0, winFocus: "not tried", hasFocus: true, active: "button" }, (s, p) => {
  if (p.op === "steal") return { ...s, stolen: s.stolen + 1, active: "Target field", focusEv: s.focusEv + 1 };
  if (p.op === "loop") return { ...s, loop: !!p.value };
  if (p.op === "win") return { ...s, winFocus: "browser refused" };
  return s;
});

function FocusInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Moves your keyboard focus to a field you did not pick, and tries to raise this window." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Click Steal, then start typing in your field. In three seconds your keystrokes land in the target. Browsers refuse window.focus() from background tabs.">
          <div className="pc-row"><input className="pc-in" placeholder="Your field: type here" aria-label="Your field" /><input className="pc-in" placeholder="Target field" aria-label="Target field" data-pc-focus-target /></div>
          <div className="pc-row">
            <Act on={on} pri onClick={() => send({ op: "steal" })}>{d.pending ? "Stealing in 3 s…" : "Steal focus in 3 s"}</Act>
            <Tog on={on} checked={d.loop} onChange={(v) => send({ op: "loop", value: v })}>Keep stealing every 2 s</Tog>
            <Act on={on} onClick={() => send({ op: "win" })}>Call window.focus()</Act>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Focus is in", v: d.active, hot: true },
        { k: "Window has focus", v: d.hasFocus ? "yes" : "no" },
        { k: "Times stolen", v: d.stolen, digits: 0 },
        { k: "Keeps stealing", v: onoff(d.loop) },
        { k: "window.focus()", v: d.winFocus },
        { k: "Focus events", v: d.focusEv, digits: 0 },
        { k: "Blur events", v: d.blurEv, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Dialogs ----------

function dialogLive(ctx: Ctx) {
  if (typeof window.alert !== "function") unsupported("alert");
  const st = { count: 0, last: "none", result: "none", blocked: 0, maxGap: 0, quick: false };
  let tick = performance.now();
  const stop = every(100, () => { const n = performance.now(); st.maxGap = Math.max(st.maxGap, Math.round(n - tick)); tick = n; });
  const b = bind("reach.dialogs", ctx, {
    read: (): Rec => ({ ...st }),
    apply: (p) => {
      if (p.reset) { Object.assign(st, { count: 0, last: "none", result: "none", blocked: 0, maxGap: 0, quick: false }); return; }
      const t0 = performance.now();
      const r = p.kind === "alert" ? window.alert("This is an alert. The page script is frozen until you press OK.") : p.kind === "confirm" ? window.confirm("This is a confirm. The page script waits for your answer.") : window.prompt("This is a prompt. Type anything:", "hello");
      st.blocked = Math.round(performance.now() - t0);
      st.count++; st.last = p.kind;
      st.result = p.kind === "alert" ? "OK" : p.kind === "confirm" ? (r ? "true" : "false") : r === null ? "null (cancelled)" : JSON.stringify(r);
      st.quick = st.blocked < 40;
      tick = performance.now();
    },
  });
  return () => { stop(); b(); };
}

const dialogSim = (ctx: Ctx) => simulate<Rec>("reach.dialogs", ctx, { count: 0, last: "none", result: "none", blocked: 0, maxGap: 0, quick: false }, (s, p) => p.reset ? { ...s, count: 0, last: "none", result: "none", blocked: 0 } : { ...s, count: s.count + 1, last: p.kind, result: p.kind === "alert" ? "OK" : p.kind === "confirm" ? "true" : "\"hello\"", blocked: 2400, maxGap: 2400 });

function DialogInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Pops up alert, confirm and prompt boxes and times how long they froze the page." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Chrome offers a tick box to stop a page from making more dialogs after a few. A dialog that returns at once usually means it was suppressed.">
          <div className="pc-row">{(["alert", "confirm", "prompt"] as const).map((k) => <Act key={k} on={on} pri={k === "alert"} onClick={() => send({ kind: k })}>{k}()</Act>)}<Act on={on} onClick={() => send({ reset: true })}>Clear</Act></div>
          {d.quick && d.count > 0 && <p className="pc-msg">That dialog came back instantly. It was probably suppressed by the browser.</p>}
        </Panel>
      }
      side={<Readout rows={[
        { k: "Last dialog", v: d.last, hot: true },
        { k: "Answer", v: d.result },
        { k: "Page frozen for", v: d.blocked, u: "ms", digits: 0 },
        { k: "Longest stall seen", v: d.maxGap, u: "ms", digits: 0 },
        { k: "Dialogs shown", v: d.count, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Popover and modal dialog ----------

function popoverLive(ctx: Ctx) {
  if (typeof HTMLDialogElement === "undefined" || !("showModal" in HTMLDialogElement.prototype)) unsupported("the dialog element");
  const dlg = () => q<HTMLDialogElement>("[data-pc-dialog]");
  const pop = () => q("[data-pc-popover]") as any;
  const st = { closed: 0, toggles: 0, mode: "auto", closeValue: "" };
  const popOpen = () => { try { return !!pop()?.matches(":popover-open"); } catch { return false; } };
  return bind("reach.popover-dialog", ctx, {
    read: (): Rec => ({ supportsPopover: "popover" in HTMLElement.prototype, open: !!dlg()?.open, modal: (() => { try { return !!dlg()?.matches(":modal"); } catch { return false; } })(), popOpen: popOpen(), ...st }),
    apply: (p) => {
      const dd = dlg(), pp = pop();
      if (!dd || !pp) throw new DOMException("The demo box is not on screen yet", "InvalidStateError");
      if (p.op === "modal" && !dd.open) dd.showModal();
      if (p.op === "plain" && !dd.open) dd.show();
      if (p.op === "close") dd.close("closed by the page");
      if (p.op === "mode") { st.mode = p.value; pp.setAttribute("popover", p.value); }
      if (p.op === "popover") { if (!("showPopover" in pp)) unsupported("the popover attribute"); popOpen() ? pp.hidePopover() : pp.showPopover(); }
    },
    watch: (re) => {
      const c = (e: Event) => { if ((e.target as Element)?.matches?.("[data-pc-dialog]")) { st.closed++; st.closeValue = (e.target as HTMLDialogElement).returnValue; re(); } };
      const t = (e: Event) => { if ((e.target as Element)?.matches?.("[data-pc-popover]")) { st.toggles++; re(); } };
      document.addEventListener("close", c, true); document.addEventListener("toggle", t, true);
      return () => { document.removeEventListener("close", c, true); document.removeEventListener("toggle", t, true); };
    },
    restore: () => { try { dlg()?.close(); } catch { /* ignore */ } try { if (popOpen()) pop().hidePopover(); } catch { /* ignore */ } },
  });
}

const popoverSim = (ctx: Ctx) => simulate<Rec>("reach.popover-dialog", ctx, { supportsPopover: true, open: false, modal: false, popOpen: false, closed: 0, toggles: 0, mode: "auto", closeValue: "" }, (s, p) => {
  if (p.op === "modal") return { ...s, open: true, modal: true };
  if (p.op === "plain") return { ...s, open: true, modal: false };
  if (p.op === "close") return { ...s, open: false, modal: false, closed: s.closed + 1, closeValue: "closed by the page" };
  if (p.op === "mode") return { ...s, mode: p.value };
  if (p.op === "popover") return { ...s, popOpen: !s.popOpen, toggles: s.toggles + 1 };
  return s;
});

function PopoverInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Opens a modal dialog that blocks the page behind it, and a popover that floats above it." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="A modal dialog makes everything behind it unusable, so Stop is out of reach until you close it. Press Escape or use the Close button.">
          <div className="pc-row">
            <Act on={on} pri onClick={() => send({ op: "modal" })}>Open modal dialog</Act>
            <Act on={on} onClick={() => send({ op: "plain" })}>Open without blocking</Act>
            <Act on={on} onClick={() => send({ op: "popover" })}>Toggle popover</Act>
            <span className="pc-l">Popover</span>
            <div className="seg">{["auto", "manual"].map((k) => <button key={k} type="button" className={d.mode === k ? "on" : ""} disabled={!on} onClick={() => send({ op: "mode", value: k })}>{k}</button>)}</div>
          </div>
          <dialog data-pc-dialog className="pd-dialog"><b>A dialog from the page</b><span>Modal means the rest of the page is switched off until you answer.</span><form method="dialog"><button className="btn sm pri" value="ok">Close</button></form></dialog>
          <div popover="auto" data-pc-popover className="pd-pop"><b>A popover</b><span>In auto mode, a click outside or Escape closes it. In manual mode only the page can.</span></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Dialog", v: d.open ? (d.modal ? "open, modal" : "open, not blocking") : "closed", hot: true },
        { k: "Popover", v: d.popOpen ? "open" : "closed" },
        { k: "Popover mode", v: d.mode },
        { k: "Popover supported", v: d.supportsPopover ? "yes" : "no" },
        { k: "Dialog closes", v: d.closed, digits: 0 },
        { k: "Popover toggles", v: d.toggles, digits: 0 },
        { k: "Close value", v: d.closeValue || "none" },
      ]} />}
    />
  );
}

// ---------- Print ----------

function printLive(ctx: Ctx) {
  if (typeof window.print !== "function") unsupported("window.print");
  const title0 = document.title;
  const st = { before: 0, after: 0, swap: false, blocked: 0, printMedia: false };
  const bp = () => { st.before++; if (st.swap) document.title = "Invoice 1042 (title set by the page)"; };
  const ap = () => { st.after++; document.title = title0; };
  return bind("surroundings.print", ctx, {
    read: (): Rec => ({ ...st, title: document.title, printMedia: matchMedia("print").matches }),
    apply: (p) => {
      if (typeof p.swap === "boolean") st.swap = p.swap;
      if (p.op === "print") { const t0 = performance.now(); window.print(); st.blocked = Math.round(performance.now() - t0); }
    },
    watch: (re) => {
      const a = () => { bp(); re(); }, b = () => { ap(); re(); };
      addEventListener("beforeprint", a); addEventListener("afterprint", b);
      return () => { removeEventListener("beforeprint", a); removeEventListener("afterprint", b); };
    },
    restore: () => { document.title = title0; },
  });
}

const printSim = (ctx: Ctx) => simulate<Rec>("surroundings.print", ctx, { before: 0, after: 0, swap: false, blocked: 0, title: "Console", printMedia: false }, (s, p) => typeof p.swap === "boolean" ? { ...s, swap: p.swap } : p.op === "print" ? { ...s, before: s.before + 1, after: s.after + 1, blocked: 3100 } : s);

function PrintInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Opens the print dialog from script and counts the before and after print events." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="The page cannot print silently or pick a printer; it can only open the same dialog you get from Ctrl or Cmd P. Cancel it to carry on.">
          <div className="pc-row"><Act on={on} pri onClick={() => send({ op: "print" })}>Open the print dialog</Act><Tog on={on} checked={d.swap} onChange={(v) => send({ swap: v })}>Rename the page for print</Tog></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Before print events", v: d.before, digits: 0, hot: true },
        { k: "After print events", v: d.after, digits: 0 },
        { k: "Page frozen for", v: d.blocked, u: "ms", digits: 0 },
        { k: "Tab title now", v: short(d.title, 36) },
        { k: "Print styles active", v: d.printMedia ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Autoplay ----------

function wavUrl(): string {
  const rate = 8000, n = 2000, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((i / rate) * 2 * Math.PI * 440) * 9000 * (1 - i / n), true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function autoplayLive(ctx: Ctx) {
  if (typeof Audio === "undefined") unsupported("HTMLAudioElement");
  const url = wavUrl();
  const log: string[] = [];
  const ua = () => nav().userActivation;
  const policy = (t: string) => { try { return nav().getAutoplayPolicy ? nav().getAutoplayPolicy(t) : "not reported"; } catch { return "not reported"; } };
  const note = (s: string) => { log.unshift(s); log.length = Math.min(log.length, 6); };
  let ac: AudioContext | null = null;
  return bind("surroundings.autoplay", ctx, {
    read: (): Rec => ({ elem: policy("mediaelement"), audio: policy("audiocontext"), active: ua() ? ua().isActive : null, been: ua() ? ua().hasBeenActive : null, log: [...log] }),
    apply: async (p) => {
      if (p.op === "audio" || p.op === "muted") {
        const a = new Audio(url); a.volume = 0.25; a.muted = p.op === "muted";
        try { await a.play(); note(`${p.op === "muted" ? "Muted" : "Sound"} play(): allowed`); } catch (e: any) { note(`${p.op === "muted" ? "Muted" : "Sound"} play(): refused (${e?.name})`); }
      }
      if (p.op === "webaudio") {
        ac?.close().catch(() => {});
        ac = new AudioContext();
        const before = ac.state;
        try { await ac.resume(); } catch { /* reported below */ }
        note(`AudioContext: ${before} at creation, ${ac.state} after resume`);
      }
    },
    watch: (re) => every(1000, re),
    restore: () => { ac?.close().catch(() => {}); URL.revokeObjectURL(url); },
  });
}

const autoplaySim = (ctx: Ctx) => simulate<Rec>("surroundings.autoplay", ctx, { elem: "allowed-muted", audio: "disallowed", active: true, been: true, log: [] }, (s, p) => ({ ...s, log: [p.op === "muted" ? "Muted play(): allowed" : p.op === "audio" ? "Sound play(): refused (NotAllowedError)" : "AudioContext: suspended at creation, running after resume", ...s.log].slice(0, 6) }));

function AutoplayInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Tries to play a short sound without a click on the media itself and reports what the browser allows." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Because you clicked the button, sound is usually allowed here. On a page you only opened, the same call is refused until you touch the page.">
          <div className="pc-row"><Act on={on} pri onClick={() => send({ op: "audio" })}>Play a beep</Act><Act on={on} onClick={() => send({ op: "muted" })}>Play it muted</Act><Act on={on} onClick={() => send({ op: "webaudio" })}>Start audio engine</Act></div>
          <ul className="pd-log">{d.log.length ? d.log.map((x: string, i: number) => <li key={i}>{x}</li>) : <li>Nothing tried yet</li>}</ul>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Media element policy", v: d.elem, hot: true },
        { k: "Audio engine policy", v: d.audio },
        { k: "Click still fresh", v: d.active === null ? "not reported" : d.active ? "yes" : "no" },
        { k: "Ever clicked here", v: d.been === null ? "not reported" : d.been ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- View transitions ----------

function vtLive(ctx: Ctx) {
  if (typeof doc().startViewTransition !== "function") unsupported("View Transitions");
  const st = { runs: 0, lastMs: 0, flip: false, ms: 500, kind: "none", reduced: false };
  const el = () => q("[data-pc-vt]");
  const root = document.documentElement;
  const b = bind("reach.view-transitions", ctx, {
    read: (): Rec => ({ ...st, reduced: matchMedia("(prefers-reduced-motion: reduce)").matches }),
    apply: async (p) => {
      if (typeof p.ms === "number") { st.ms = p.ms; root.style.setProperty("--pc-vt-ms", `${p.ms}ms`); }
      if (p.op === "run") {
        const e = el();
        if (!e) throw new DOMException("The demo box is not on screen yet", "InvalidStateError");
        e.style.setProperty("view-transition-name", "pcvt");
        root.dataset.pcvt = String(p.kind);
        const t0 = performance.now();
        const t = doc().startViewTransition(() => { st.flip = !st.flip; e.dataset.state = st.flip ? "b" : "a"; });
        try { await t.finished; } finally { e.style.removeProperty("view-transition-name"); delete root.dataset.pcvt; }
        st.runs++; st.lastMs = Math.round(performance.now() - t0); st.kind = String(p.kind);
      }
    },
    restore: () => { root.style.removeProperty("--pc-vt-ms"); delete root.dataset.pcvt; const e = el(); if (e) { e.style.removeProperty("view-transition-name"); e.dataset.state = "a"; } },
  });
  return b;
}

const vtSim = (ctx: Ctx) => simulate<Rec>("reach.view-transitions", ctx, { runs: 0, lastMs: 0, flip: false, ms: 500, kind: "none", reduced: false }, (s, p) => typeof p.ms === "number" ? { ...s, ms: p.ms } : p.op === "run" ? { ...s, runs: s.runs + 1, flip: !s.flip, lastMs: s.ms, kind: p.kind } : s);

function VtInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Animates a change in this page with the browser's own transition engine." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="The browser takes a picture of the page before and after the change and animates between them. It also works across page loads on the same site.">
          <div className="pd-vt-stage"><div data-pc-vt data-state={d.flip ? "b" : "a"} className="pd-vt-box">{d.flip ? "After" : "Before"}</div></div>
          <div className="pc-row">
            <Act on={on} pri onClick={() => send({ op: "run", kind: "slide" })}>Slide</Act>
            <Act on={on} onClick={() => send({ op: "run", kind: "fade" })}>Change with a fade</Act>
            <label className="pc-rng">Speed<input type="range" min={100} max={2000} step={100} value={d.ms} disabled={!on} onChange={(e) => send({ ms: +e.target.value })} /><b>{d.ms} ms</b></label>
          </div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Transitions run", v: d.runs, digits: 0, hot: true },
        { k: "Last took", v: d.lastMs, u: "ms", digits: 0 },
        { k: "Last kind", v: d.kind },
        { k: "Reduce motion set", v: d.reduced ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Text fragments ----------

const FRAG_PARAGRAPHS = [
  "Platform ontology lists what a web page can do without asking.",
  "A text fragment link scrolls to a phrase and highlights it, with no script on the target page.",
  "The quick brown fox jumps over the lazy dog, then naps in the afternoon sun.",
  "Browsers never tell the page which phrase was highlighted, which keeps the feature private.",
];

function fragLive(ctx: Ctx) {
  const st = { opened: 0, url: "", wins: [] as (Window | null)[] };
  let blob = "";
  const page = () => {
    if (blob) return blob;
    const html = `<!doctype html><meta charset=utf-8><title>Text fragment demo</title><body style="font:18px/1.6 system-ui;max-width:34em;margin:40px auto;padding:0 16px"><h1>Text fragment demo</h1>${FRAG_PARAGRAPHS.map((p) => `<p>${p}</p>`).join("")}<p style="margin-top:50vh">${FRAG_PARAGRAPHS[2]}</p><p style="margin-top:80vh">End of page.</p>`;
    blob = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    return blob;
  };
  const build = (p: Rec) => `${page()}#:~:text=${encodeURIComponent(String(p.start || "fox"))}${p.end ? "," + encodeURIComponent(String(p.end)) : ""}`;
  return bind("reach.text-fragments", ctx, {
    read: (): Rec => ({ supported: "fragmentDirective" in document, css: CSS.supports("selector(::target-text)"), opened: st.opened, url: st.url ? short(st.url.replace(/^blob:[^#]*/, "blob:…"), 56) : "none", links: [...(performance.getEntriesByType("navigation") as PerformanceNavigationTiming[])].length }),
    apply: async (p) => {
      if (!("fragmentDirective" in document)) unsupported("Text fragments");
      st.url = build(p);
      if (p.op === "copy") { await navigator.clipboard.writeText(st.url); return; }
      const w = window.open(st.url, "_blank");
      if (!w) throw new DOMException("The browser blocked the new tab", "NotAllowedError");
      st.wins.push(w); st.opened++;
    },
    restore: () => { st.wins.forEach((w) => { try { w?.close(); } catch { /* ignore */ } }); if (blob) URL.revokeObjectURL(blob); },
  });
}

const fragSim = (ctx: Ctx) => simulate<Rec>("reach.text-fragments", ctx, { supported: true, css: true, opened: 0, url: "none", links: 1 }, (s, p) => ({ ...s, opened: s.opened + (p.op === "open" ? 1 : 0), url: `blob:…#:~:text=${encodeURIComponent(String(p.start || "fox"))}${p.end ? "," + encodeURIComponent(String(p.end)) : ""}` }));

function FragInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  const [start, setStart] = useState("quick brown");
  const [end, setEnd] = useState("lazy dog");
  if (!d) return <Frame visual={<Waiting session={session} what="Builds a link that opens a page scrolled to a phrase and highlighted." />} />;
  const p = { start, end };
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Opens a small demo page in a new tab with the phrase highlighted. Leave the end empty to match one phrase. Stop closes the tab.">
          <div className="pd-quote">{FRAG_PARAGRAPHS[2]}</div>
          <div className="pc-row"><span className="pc-l">From</span><input className="pc-in" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start of the phrase" disabled={!on} /><span className="pc-l">To</span><input className="pc-in" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End of the phrase" disabled={!on} /></div>
          <div className="pc-row"><Act on={on} pri onClick={() => send({ op: "open", ...p })}>Open highlighted page</Act><Act on={on} onClick={() => send({ op: "copy", ...p })}>Copy the link</Act></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Supported here", v: d.supported ? "yes" : "no", hot: true },
        { k: "Highlight style (css)", v: d.css ? "yes" : "no" },
        { k: "Tabs opened", v: d.opened, digits: 0 },
        { k: "Last link", v: d.url },
      ]} />}
    />
  );
}

// ---------- Open popup ----------

function popupLive(ctx: Ctx) {
  if (typeof window.open !== "function") unsupported("window.open");
  const st = { opened: 0, blocked: 0, last: "none", opener: "n/a" };
  const wins: Window[] = [];
  const open = (kind: string, noopener: boolean) => {
    const features = (kind === "popup" ? "popup=yes,width=380,height=260" : "") + (noopener ? (kind === "popup" ? "," : "") + "noopener" : "");
    const w = window.open("about:blank", kind === "tab" ? "_blank" : "pc_popup_demo", features);
    if (!w) { st.blocked++; st.last = `${kind}: blocked`; st.opener = "n/a"; return; }
    st.opened++; wins.push(w);
    st.last = `${kind}: opened`;
    try { st.opener = w.opener === window ? "page can reach this tab" : "no link back"; w.document.title = "Popup demo"; w.document.body.textContent = "Opened by the console. You can close this window."; } catch { st.opener = "no link back"; }
  };
  return bind("reach.open-popup", ctx, {
    read: (): Rec => ({ ...st, alive: wins.filter((w) => !w.closed).length }),
    apply: async (p) => {
      if (p.op === "delayed") { await wait(3000); }
      open(p.op === "delayed" ? "popup" : p.op, !!p.noopener);
      if (p.op === "delayed") st.last += " (after 3 s wait)";
    },
    watch: (re) => every(1000, re),
    restore: () => wins.forEach((w) => { try { w.close(); } catch { /* ignore */ } }),
  });
}

const popupSim = (ctx: Ctx) => simulate<Rec>("reach.open-popup", ctx, { opened: 0, blocked: 0, last: "none", opener: "n/a", alive: 0 }, (s, p) => ({ ...s, opened: s.opened + 1, alive: s.alive + 1, last: `${p.op}: opened`, opener: p.noopener ? "no link back" : "page can reach this tab" }));

function PopupInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  const [no, setNo] = useState(false);
  if (!d) return <Frame visual={<Waiting session={session} what="Opens a small window or a new tab from a click, and shows whether the page keeps a link to it." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Popups opened straight from a click are allowed. One opened after waiting may be blocked, depending on the browser. Stop closes every window it opened.">
          <div className="pc-row"><Act on={on} pri onClick={() => send({ op: "popup", noopener: no })}>Open small window</Act><Act on={on} onClick={() => send({ op: "tab", noopener: no })}>Open new tab</Act><Act on={on} onClick={() => send({ op: "delayed", noopener: no })}>Open after 3 s wait</Act></div>
          <div className="pc-row"><Tog on={on} checked={no} onChange={setNo}>Cut the link back (noopener)</Tog></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Last try", v: d.last, hot: true },
        { k: "Opened", v: d.opened, digits: 0 },
        { k: "Blocked", v: d.blocked, digits: 0 },
        { k: "Still open", v: d.alive, digits: 0 },
        { k: "Link back to this tab", v: d.opener },
      ]} />}
    />
  );
}

// ---------- Close a window ----------

function closeLive(ctx: Ctx) {
  if (typeof window.close !== "function") unsupported("window.close");
  let pop: Window | null = null;
  const st = { self: "not tried", closedByPage: 0, blocked: false };
  const canTrySelf = () => !window.opener && history.length > 1;
  return bind("reach.window-close", ctx, {
    read: (): Rec => ({ open: !!pop && !pop.closed, closedByPage: st.closedByPage, self: st.self, blocked: st.blocked, hasOpener: !!window.opener, canTrySelf: canTrySelf() }),
    apply: async (p) => {
      if (p.op === "open") { pop = window.open("about:blank", "pc_close_demo", "popup=yes,width=340,height=200"); st.blocked = !pop; if (!pop) throw new DOMException("The browser blocked the popup", "NotAllowedError"); pop.document.body.textContent = "Opened by the page. The page can close it."; }
      if (p.op === "close") { if (!pop || pop.closed) throw new DOMException("Open the popup first", "InvalidStateError"); pop.close(); st.closedByPage++; }
      if (p.op === "self") {
        if (!canTrySelf()) { st.self = "not tried: closing this tab might work, so it was skipped"; return; }
        window.close();
        await wait(400);
        st.self = window.closed ? "closed" : "ignored: this tab was not opened by script";
      }
    },
    watch: (re) => every(800, re),
    restore: () => { try { pop?.close(); } catch { /* ignore */ } },
  });
}

const closeSim = (ctx: Ctx) => simulate<Rec>("reach.window-close", ctx, { open: false, closedByPage: 0, self: "not tried", blocked: false, hasOpener: false, canTrySelf: true }, (s, p) => p.op === "open" ? { ...s, open: true } : p.op === "close" ? { ...s, open: false, closedByPage: s.closedByPage + 1 } : { ...s, self: "ignored: this tab was not opened by script" });

function CloseInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  if (!d) return <Frame visual={<Waiting session={session} what="Opens a window and closes it from script, then tries to close this tab." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Browsers let a page close windows it opened, but not a tab you opened yourself.">
          <div className="pc-row"><Act on={on} pri onClick={() => send({ op: "open" })}>Open a window</Act><Act on={on && d.open} onClick={() => send({ op: "close" })}>Close it from script</Act><Act on={on} onClick={() => send({ op: "self" })}>Try closing this tab</Act></div>
        </Panel>
      }
      side={<Readout rows={[
        { k: "Window", v: d.open ? "open" : "closed", hot: true },
        { k: "Closed by the page", v: d.closedByPage, digits: 0 },
        { k: "Closing this tab", v: short(d.self, 44) },
        { k: "Opened by a script", v: d.hasOpener ? "yes" : "no" },
        { k: "Popup blocked", v: d.blocked ? "yes" : "no" },
      ]} />}
    />
  );
}

// ---------- Navigate or redirect the tab ----------

const NAV_IDS = ["reach.navigate-top", "web.actions.navigate-top"];
const navTarget = () => location.origin + location.pathname + location.search + "#" + (decodeURIComponent(location.hash.slice(1)) === NAV_IDS[0] ? NAV_IDS[1] : NAV_IDS[0]);

function navLive(ctx: Ctx) {
  const hash0 = location.hash;
  const st = { assigns: 0, replaces: 0, hashchanges: 0, tried: 0, blocked: 0, byFrame: 0, last: "none" };
  let re = () => {};
  const hc = () => { st.hashchanges++; re(); };
  const msg = (e: MessageEvent) => {
    if (e.data?.pc !== "nav-top") return;
    st.tried++;
    const before = st.hashchanges;
    setTimeout(() => { if (st.hashchanges > before) { st.byFrame++; st.last = "the frame redirected this tab"; } else { st.blocked++; st.last = "blocked: the frame may not navigate the top page"; } re(); }, 500);
  };
  return bind("reach.navigate-top", ctx, {
    read: (): Rec => ({ ...st, hash: location.hash || "none", history: history.length }),
    apply: (p) => {
      if (p.op === "assign") { st.assigns++; st.last = "location.assign (new history entry)"; location.assign(navTarget()); }
      if (p.op === "replace") { st.replaces++; st.last = "location.replace (no new entry)"; location.replace(navTarget()); }
    },
    watch: (r) => { re = r; addEventListener("hashchange", hc); addEventListener("message", msg); return () => { removeEventListener("hashchange", hc); removeEventListener("message", msg); }; },
    restore: () => history.replaceState(null, "", location.pathname + location.search + hash0),
  });
}

const navSim = (ctx: Ctx) => simulate<Rec>("reach.navigate-top", ctx, { assigns: 0, replaces: 0, hashchanges: 0, tried: 0, blocked: 0, byFrame: 0, last: "none", hash: "none", history: 3 }, (s, p) => p.op === "assign" ? { ...s, assigns: s.assigns + 1, history: s.history + 1, last: "location.assign (new history entry)" } : { ...s, replaces: s.replaces + 1, last: "location.replace (no new entry)" });

const FRAME_PERMS = [["", "Not allowed"], ["allow-top-navigation-by-user-activation", "Only after a click"], ["allow-top-navigation", "Allowed"]];

function NavInstrument({ scope, session }: InstrumentProps) {
  const { d, on, sim, send } = useCtl<Rec>(scope, session);
  const [perm, setPerm] = useState("");
  const target = useMemo(navTarget, [d?.hash]); // eslint-disable-line react-hooks/exhaustive-deps
  const srcDoc = useMemo(() => `<!doctype html><body style="font:13px system-ui;margin:12px"><button id=b style="font:13px system-ui;padding:6px 12px">Redirect the page that contains me</button><script>document.getElementById("b").onclick=function(){try{top.location.href=${JSON.stringify(target)}}catch(e){}parent.postMessage({pc:"nav-top"},"*")}<\/script>`, [target]);
  if (!d) return <Frame visual={<Waiting session={session} what="Redirects this tab from script, and from an embedded frame that may or may not be allowed to." />} />;
  return (
    <Frame
      visual={
        <Panel on={on} sim={sim} error={d.error} note="Redirects here only flip the address between two names for this same view, so nothing is lost. Stop puts the address back.">
          <div className="pc-row"><Act on={on} pri onClick={() => send({ op: "assign" })}>location.assign()</Act><Act on={on} onClick={() => send({ op: "replace" })}>location.replace()</Act></div>
          <div className="pc-row"><span className="pc-l">Embedded frame may redirect this tab</span><div className="seg">{FRAME_PERMS.map(([k, l]) => <button key={k || "none"} type="button" className={perm === k ? "on" : ""} disabled={!on || sim} onClick={() => setPerm(k)}>{l}</button>)}</div></div>
          {sim ? <p className="pc-foot">Frames do not run in simulated mode.</p> : <iframe key={perm} title="Embedded frame" className="pd-frame" sandbox={"allow-scripts " + perm} srcDoc={srcDoc} />}
        </Panel>
      }
      side={<Readout rows={[
        { k: "Last redirect", v: d.last, hot: true },
        { k: "assign calls", v: d.assigns, digits: 0 },
        { k: "replace calls", v: d.replaces, digits: 0 },
        { k: "Frame tried", v: d.tried, digits: 0 },
        { k: "Frame succeeded", v: d.byFrame, digits: 0 },
        { k: "Frame blocked", v: d.blocked, digits: 0 },
        { k: "Address hash", v: short(String(d.hash), 30) },
        { k: "History entries", v: d.history, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Registry ----------

const base = { passive: true, layer: 1 as const, modes: { detect: "Reads the current value.", create: "Changes it in this tab while it runs; Stop puts it back." } };
const viaClick = { ...base, gesture: true };

export const pageActionDisplayScopes: ScopeDef[] = [
  {
    ...base, id: "device.page-zoom", name: "Page zoom", domain: "device", atlas: ["web.display.page-zoom", "web.locale.zoom-text-size"], icon: ZoomIn,
    summary: "Reads how zoomed this page is, zooms a box of its own, and can block or replace the zoom shortcuts and pinch.",
    call: "devicePixelRatio; el.style.zoom; addEventListener('wheel', e => e.preventDefault())",
    reveals: ["Whether you zoom in, which can hint at low vision or an older person", "A page cannot set your browser zoom, but it can stop you changing it with shortcuts"],
    live: async (ctx) => zoomLive(ctx), sim: zoomSim, Instrument: ZoomInstrument,
  },
  {
    ...base, id: "device.custom-cursor", name: "Custom cursor", domain: "device", atlas: ["web.display.custom-cursor"], icon: MousePointer2,
    summary: "Swaps or hides the mouse pointer inside a box on the page.",
    call: "el.style.cursor = 'url(img) 16 16, auto'",
    reveals: ["Whether you use a mouse or touch", "A way to hide or fake the pointer inside the page"],
    live: async (ctx) => cursorLive(ctx), sim: cursorSim, Instrument: CursorInstrument,
  },
  {
    ...base, id: "device.scroll-control", name: "Scroll control", domain: "device", atlas: ["web.display.scroll-control"], icon: ScrollText,
    summary: "Scrolls a box for you, slows or locks the wheel, contains overscroll and snaps to sections.",
    call: "el.scrollTo({ top, behavior: 'smooth' }); wheel preventDefault",
    reveals: ["How far down you read", "A way to hijack your scroll speed"],
    live: async (ctx) => scrollLive(ctx), sim: scrollSim, Instrument: ScrollInstrument,
  },
  {
    ...viaClick, id: "device.window-move-resize", name: "Move and resize a window", domain: "device", atlas: ["web.display.window-move-resize"], icon: Move,
    summary: "Opens a small window, moves and resizes it from script, then shows the browser ignoring the same on this tab.",
    call: "popup.moveTo(x, y); popup.resizeTo(w, h)",
    reveals: ["Where your windows sit on screen", "A way to chase a popup around the screen"],
    live: async (ctx) => winLive(ctx), sim: winSim, Instrument: WinInstrument,
  },
  {
    ...viaClick, id: "device.orientation-lock", name: "Screen orientation lock", domain: "device", atlas: ["web.peripherals.screen-orientation-lock", "web.display.screen-orientation"], icon: Smartphone,
    summary: "Reads portrait or landscape and asks the screen to stay in one, going fullscreen first when needed.",
    call: "screen.orientation.lock('landscape')",
    reveals: ["Whether you hold the phone upright or on its side", "A way to force a layout until you leave"],
    live: async (ctx) => orientLive(ctx), sim: orientSim, Instrument: OrientInstrument,
  },
  {
    ...viaClick, id: "device.video-pip", name: "Video picture in picture", domain: "device", atlas: ["web.display.picture-in-picture"], icon: PictureInPicture2,
    summary: "Plays a page-made video and floats it in a small always-on-top window.",
    call: "video.requestPictureInPicture()",
    reveals: ["That you watch video while doing something else", "A way to keep content on screen above other apps"],
    live: async (ctx) => videoPipLive(ctx), sim: pipSim("device.video-pip"), Instrument: PipInstrument("video", "Plays a page-made video and floats it in a small window above other apps."),
  },
  {
    ...viaClick, id: "capture.camera-pip", name: "Camera picture in picture", domain: "capture", atlas: ["web.camera.picture-in-picture"], icon: Camera, permission: "camera",
    summary: "Opens your camera, then floats the live view above other apps, with an optional automatic float when you switch tabs.",
    call: "getUserMedia({ video }); video.requestPictureInPicture()",
    reveals: ["Your face, shown in a window that stays above your other apps", "A page that keeps the camera visible while you look away"],
    live: cameraPipLive, sim: pipSim("capture.camera-pip"), Instrument: PipInstrument("camera", "Opens the camera and floats its live view in a small window above other apps."),
  },
  {
    ...viaClick, id: "capture.copy-event", name: "Copy and cut rewrite", domain: "capture", atlas: ["web.input.copy-event"], icon: ClipboardCopy,
    summary: "Listens for copy and cut in a text box and changes what ends up on your clipboard.",
    call: "addEventListener('copy', e => e.clipboardData.setData('text/plain', …))",
    reveals: ["What text you selected and copied", "A way to add a tracking link or swap what you copy"],
    live: async (ctx) => copyLive(ctx), sim: copySim, Instrument: CopyInstrument,
  },
  {
    ...base, id: "motion.drag-and-drop", name: "Drag and drop", domain: "motion", atlas: ["web.actions.drag-and-drop"], icon: Hand,
    summary: "Lets you drag items onto a drop box and shows what the page learns about dropped files.",
    call: "addEventListener('drop', e => e.dataTransfer.files)",
    reveals: ["Names, sizes and types of files you drop", "What you pick up and where you put it"],
    live: async (ctx) => dragLive(ctx), sim: dragSim, Instrument: DragInstrument,
  },
  {
    ...base, id: "reach.focus-stealing", name: "Focus stealing", domain: "reach", atlas: ["web.actions.focus-stealing"], icon: Focus,
    summary: "Moves your keyboard focus to a field you did not pick and tries to raise this window.",
    call: "el.focus(); window.focus()",
    reveals: ["Whether this window has your attention", "A way to catch keystrokes meant for another field"],
    live: async (ctx) => focusLive(ctx), sim: focusSim, Instrument: FocusInstrument,
  },
  {
    ...viaClick, id: "reach.dialogs", name: "Alert, confirm and prompt", domain: "reach", atlas: ["web.actions.dialogs"], icon: MessageSquareWarning,
    summary: "Pops up alert, confirm and prompt boxes and times how long they freeze the page.",
    call: "alert(msg); confirm(msg); prompt(msg)",
    reveals: ["Your answer typed into a prompt", "A way to freeze the page until you respond"],
    live: async (ctx) => dialogLive(ctx), sim: dialogSim, Instrument: DialogInstrument,
  },
  {
    ...base, id: "reach.popover-dialog", name: "Popover and modal dialog", domain: "reach", atlas: ["web.actions.popover-dialog"], icon: SquareStack,
    summary: "Opens a modal dialog that blocks the page behind it and a popover that floats above it.",
    call: "dialog.showModal(); popover.showPopover()",
    reveals: ["How you answer a box the page puts in front of you", "A way to cover the page with its own box"],
    live: async (ctx) => popoverLive(ctx), sim: popoverSim, Instrument: PopoverInstrument,
  },
  {
    ...viaClick, id: "surroundings.print", name: "Print dialog", domain: "surroundings", atlas: ["web.actions.print"], icon: Printer,
    summary: "Opens the print dialog from script and counts the before and after print events.",
    call: "window.print()",
    reveals: ["That you printed or saved the page as PDF", "A page can rename itself for the printout"],
    live: async (ctx) => printLive(ctx), sim: printSim, Instrument: PrintInstrument,
  },
  {
    ...viaClick, id: "surroundings.autoplay", name: "Autoplay", domain: "surroundings", atlas: ["web.actions.autoplay"], icon: Play,
    summary: "Tries to play a short sound, a muted one and the audio engine, and reports what the browser allows.",
    call: "audio.play(); new AudioContext().resume()",
    reveals: ["Whether you have ever clicked on this site", "Whether sound can start by itself"],
    live: async (ctx) => autoplayLive(ctx), sim: autoplaySim, Instrument: AutoplayInstrument,
  },
  {
    ...base, id: "reach.view-transitions", name: "View transitions", domain: "reach", atlas: ["web.actions.view-transitions"], icon: Clapperboard,
    summary: "Animates a change on the page with the browser's own transition engine.",
    call: "document.startViewTransition(() => update())",
    reveals: ["Whether you asked your device to reduce motion"],
    live: async (ctx) => vtLive(ctx), sim: vtSim, Instrument: VtInstrument,
  },
  {
    ...viaClick, id: "reach.text-fragments", name: "Text fragment links", domain: "reach", atlas: ["web.actions.text-fragments"], icon: Highlighter,
    summary: "Builds a link that opens a page scrolled to a phrase and highlighted.",
    call: "location = url + '#:~:text=phrase'",
    reveals: ["A way to point you at one phrase on any page", "The page you land on never learns which phrase was highlighted"],
    live: async (ctx) => fragLive(ctx), sim: fragSim, Instrument: FragInstrument,
  },
  {
    ...viaClick, id: "reach.open-popup", name: "Open popup or new tab", domain: "reach", atlas: ["web.actions.open-popup"], icon: ExternalLink,
    summary: "Opens a small window or a new tab and shows whether the page keeps a link back to it.",
    call: "window.open(url, name, features)",
    reveals: ["Whether your browser blocks popups", "A page that keeps a handle on the windows it opened"],
    live: async (ctx) => popupLive(ctx), sim: popupSim, Instrument: PopupInstrument,
  },
  {
    ...viaClick, id: "reach.window-close", name: "Close a window", domain: "reach", atlas: ["web.actions.window-close"], icon: DoorClosed,
    summary: "Opens a window and closes it from script, then tries to close this tab.",
    call: "popup.close(); window.close()",
    reveals: ["Whether this tab was opened by a script"],
    live: async (ctx) => closeLive(ctx), sim: closeSim, Instrument: CloseInstrument,
  },
  {
    ...viaClick, id: "reach.navigate-top", name: "Redirect the tab", domain: "reach", atlas: ["web.actions.navigate-top"], icon: Navigation,
    summary: "Redirects this tab from script, and from an embedded frame that is or is not allowed to.",
    call: "location.assign(url); top.location.href = url",
    reveals: ["How many pages are in this tab's history", "Whether a frame on a page can send you somewhere else"],
    live: async (ctx) => navLive(ctx), sim: navSim, Instrument: NavInstrument,
  },
];

// Keeps the icon imports used even when a group above is edited.
void [AppWindow, Crosshair, ScreenShare, useEffect];
