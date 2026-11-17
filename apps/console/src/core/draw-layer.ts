// A live drawing layer the voice agent paints on: text, boxes, circles, lines, arrows, freehand paths
// and highlight boxes that follow a page element. It is one fixed SVG over the whole window that never
// takes the pointer, uses the page's own color tokens so it follows the light or dark theme, and keeps
// anchored items glued to their element on scroll, resize and page changes. While any account or key
// panel ([data-agent-off]) is on screen the whole layer is hidden and new drawings are refused, so a
// drawing can never sit over (or disguise) a protected control. A mutation observer and a short timer
// recheck this whenever the page changes, not only on scroll or resize.

export type DrawKind = "text" | "box" | "circle" | "line" | "arrow" | "path" | "highlight";
export type Pt = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

export type DrawSpec = {
  kind: DrawKind;
  /** Viewport pixels. text: x,y is the top left. box and circle: x,y,w,h. line and arrow: points[0] to points[1]. path: points. */
  x?: number; y?: number; w?: number; h?: number; points?: Pt[];
  /** Anchor element for highlight, and optionally the target end of an arrow or the spot for text. */
  el?: Element | null; anchor?: string;
  text?: string; label?: string;
  color?: string; width?: number; size?: number; fill?: boolean;
  seconds?: number;
};

type Item = DrawSpec & { id: string; created: number; expires?: number; g: SVGGElement; gone?: boolean };

const NS = "http://www.w3.org/2000/svg";
const OFF = "[data-agent-off]";
const COLORS: Record<string, string> = { accent: "var(--accent, #2d72d2)", ok: "var(--ok, #238551)", warn: "var(--warn, #c87619)", err: "var(--err, #cd4246)", ink: "var(--ink, #1c2127)", mute: "var(--mute, #5f6b7c)" };
export const DRAW_COLORS = Object.keys(COLORS);
export const MAX_ITEMS = 60;

let svg: SVGSVGElement | null = null;
let seq = 0;
let raf = 0;
const items = new Map<string, Item>();

const color = (c?: string) => COLORS[c || "accent"] || COLORS.accent;
const r = (n: number) => Math.round(n);

function root(): SVGSVGElement | null {
  if (typeof document === "undefined") return null;
  if (svg && svg.isConnected) return svg;
  svg = document.createElementNS(NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-draw-layer", "");
  svg.setAttribute("style", "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;overflow:visible");
  const defs = document.createElementNS(NS, "defs");
  DRAW_COLORS.forEach((k) => {
    const m = document.createElementNS(NS, "marker");
    m.setAttribute("id", `draw-head-${k}`);
    m.setAttribute("viewBox", "0 0 10 10");
    m.setAttribute("refX", "8"); m.setAttribute("refY", "5");
    m.setAttribute("markerWidth", "6"); m.setAttribute("markerHeight", "6");
    m.setAttribute("orient", "auto-start-reverse");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M0,0 L10,5 L0,10 z");
    p.setAttribute("style", `fill:${color(k)}`);
    m.appendChild(p);
    defs.appendChild(m);
  });
  svg.appendChild(defs);
  document.body.appendChild(svg);
  const kick = () => schedule();
  window.addEventListener("scroll", kick, { passive: true, capture: true });
  window.addEventListener("resize", kick, { passive: true });
  // Panels mount without a scroll or resize: hide synchronously on any DOM change that shows one.
  new MutationObserver((muts) => { if (muts.every((m) => svg?.contains(m.target))) return; guard(); schedule(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-agent-off", "hidden", "class", "style", "aria-hidden"] });
  window.setInterval(() => { if (items.size) { guard(); schedule(); } }, 250);
  return svg;
}

function schedule() {
  if (raf || typeof window === "undefined" || !items.size) return;
  raf = window.requestAnimationFrame(() => { raf = 0; if (!guard()) items.forEach(render); });
}

/** True while an account or key panel is visible; the whole layer is hidden for that time. */
export function privateShown() { return offRects().length > 0; }

/** Hide the whole layer while a private panel shows. Returns whether it is hidden. */
function guard() {
  if (!svg) return false;
  const off = privateShown();
  const want = off ? "none" : "";
  if (svg.style.display !== want) svg.style.display = want;
  return off;
}

/** Visible rects of private panels, in viewport pixels. */
function offRects(): Box[] {
  if (typeof document === "undefined") return [];
  return [...document.querySelectorAll(OFF)].map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height).map((b) => ({ x: b.left, y: b.top, w: b.width, h: b.height }));
}

/** Resolve a control id or CSS selector to a visible element, refusing private panels. */
export function resolveAnchor(anchor: string, byControlId?: (id: string) => Element | undefined): { el?: Element; error?: string } {
  if (typeof document === "undefined") return { error: "No page." };
  let el: Element | null = byControlId?.(anchor) || null;
  if (!el) try { el = document.querySelector(`[data-control="${CSS.escape(anchor)}"]`); } catch { /* not an id */ }
  if (!el) { try { el = document.querySelector(anchor); } catch { return { error: `"${anchor}" is neither a control id nor a valid selector. Call list_controls for ids.` }; } }
  if (!el) return { error: `Nothing on the page matches "${anchor}". Call list_controls for ids.` };
  if (el.closest(OFF)) return { error: "That is inside an account or key panel; you may not draw there." };
  if (el.closest("[data-draw-layer]")) return { error: "That is one of your own drawings." };
  return { el };
}

function rectOf(el: Element): Box | null {
  if (!el.isConnected) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}

function center(b: Box): Pt { return [b.x + b.w / 2, b.y + b.h / 2]; }

/** The end point of an arrow on the edge of a box, coming from p. */
function edge(b: Box, from: Pt): Pt {
  const [cx, cy] = center(b);
  const dx = from[0] - cx, dy = from[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const pad = 4;
  const sx = (b.w / 2 + pad) / Math.abs(dx || 1e-9), sy = (b.h / 2 + pad) / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy, 1);
  return [cx + dx * s, cy + dy * s];
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
}

function label(g: SVGGElement, text: string, x: number, y: number, c: string, size: number) {
  const t = el("text", { x: x + 8, y: y + size + 3, style: `font:600 ${size}px var(--sans, system-ui);fill:var(--ink, #1c2127)` });
  t.textContent = text;
  g.appendChild(t);
  // Measure, then put a theme colored pill behind it so it reads on any background.
  let bb = { x, y, width: text.length * size * 0.6, height: size + 6 };
  try { const m = t.getBBox(); if (m.width) bb = m; } catch { /* not laid out (tests) */ }
  const bg = el("rect", { x: bb.x - 6, y: bb.y - 3, width: bb.width + 12, height: bb.height + 6, rx: 4, style: `fill:var(--panel, #fff);stroke:${c};stroke-width:1.5;opacity:.95` });
  g.insertBefore(bg, t);
}

function render(it: Item) {
  const g = it.g;
  while (g.firstChild) g.removeChild(g.firstChild);
  const c = color(it.color);
  const w = it.width ?? 3;
  const stroke = `stroke:${c};stroke-width:${w};fill:none;stroke-linecap:round;stroke-linejoin:round`;
  let anchorBox: Box | null = null;
  if (it.el) {
    anchorBox = rectOf(it.el);
    it.gone = !anchorBox;
    if (!anchorBox) { g.style.display = "none"; return; }
  }
  switch (it.kind) {
    case "text": {
      const size = it.size ?? 16;
      const [x, y] = anchorBox ? [anchorBox.x, anchorBox.y + anchorBox.h + 4] : [it.x ?? 0, it.y ?? 0];
      label(g, it.text || "", x, y, c, size);
      break;
    }
    case "box":
    case "circle": {
      // Wrapping an element: follow it, padded; otherwise the fixed x,y,w,h.
      const pad = it.kind === "circle" ? 14 : 6;
      const b = anchorBox ? { x: anchorBox.x - pad, y: anchorBox.y - pad, w: anchorBox.w + pad * 2, h: anchorBox.h + pad * 2 } : { x: it.x ?? 0, y: it.y ?? 0, w: it.w ?? 0, h: it.h ?? 0 };
      const style = it.fill ? `${stroke};fill:${c};fill-opacity:.15` : stroke;
      if (it.kind === "box") g.appendChild(el("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, style }));
      else g.appendChild(el("ellipse", { cx: b.x + b.w / 2, cy: b.y + b.h / 2, rx: b.w / 2, ry: b.h / 2, style }));
      break;
    }
    case "line":
    case "arrow": {
      const pts = it.points || [];
      const a = pts[0] || [0, 0];
      const b = anchorBox ? edge(anchorBox, a) : pts[1] || a;
      const ln = el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], style: stroke });
      if (it.kind === "arrow") ln.setAttribute("marker-end", `url(#draw-head-${COLORS[it.color || ""] ? it.color : "accent"})`);
      g.appendChild(ln);
      if (anchorBox) g.appendChild(el("rect", { x: anchorBox.x - 4, y: anchorBox.y - 4, width: anchorBox.w + 8, height: anchorBox.h + 8, rx: 6, style: `stroke:${c};stroke-width:2;fill:none;stroke-dasharray:4 3` }));
      break;
    }
    case "path": {
      const pts = it.points || [];
      if (pts.length) g.appendChild(el("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" "), style: stroke }));
      break;
    }
    case "highlight": {
      const b = anchorBox!;
      g.appendChild(el("rect", { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8, rx: 6, style: `${stroke};fill:${c};fill-opacity:.12` }));
      break;
    }
  }
  if (it.label && it.kind !== "text") {
    const b = boxOf(it);
    const size = it.size ?? 14;
    // Above the shape when there is room, otherwise below it; kept inside the window.
    if (b) {
      const y = b.y - size - 12 >= 4 ? b.y - size - 12 : b.y + b.h + 4;
      const x = Math.max(4, Math.min(b.x, window.innerWidth - it.label.length * size * 0.6 - 24));
      label(g, it.label, x, y, c, size);
    }
  }
  g.style.display = "";
}

/** The drawn item's box in viewport pixels, measured from the page when it can be. */
export function boxOf(it: Item): Box | null {
  try {
    const m = it.g.getBBox();
    if (m.width || m.height) return { x: m.x, y: m.y, w: m.width, h: m.height };
  } catch { /* fall through */ }
  if (it.el) { const b = rectOf(it.el); return b && { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }; }
  const pts = it.points;
  if (pts?.length) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { x: it.x ?? 0, y: it.y ?? 0, w: it.w ?? 0, h: it.h ?? 0 };
}

/** A plain description of one item, for the agent (which cannot see the overlay in its frames). */
export function describeItem(it: Item) {
  const b = boxOf(it);
  const vw = typeof window !== "undefined" ? window.innerWidth : 0, vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const on = !!b && b.x + b.w > 0 && b.y + b.h > 0 && b.x < vw && b.y < vh;
  return {
    id: it.id, kind: it.kind, color: it.color || "accent",
    ...(it.text ? { text: it.text } : {}), ...(it.label ? { label: it.label } : {}), ...(it.anchor ? { anchor: it.anchor } : {}),
    box: b ? { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) } : null,
    state: it.gone ? "anchor gone from the page" : privateShown() ? "hidden while an account or key panel is open" : on ? "visible" : "off screen",
    age_s: r((Date.now() - it.created) / 1000),
    ...(it.expires ? { fades_in_s: Math.max(0, r((it.expires - Date.now()) / 1000)) } : {}),
  };
}

export type Drawn = ReturnType<typeof describeItem>;

/** Draw one item. Returns its description (id and on screen box) or an error. */
export function draw(spec: DrawSpec): { ok: true; item: Drawn } | { ok: false; error: string } {
  const s = root();
  if (!s) return { ok: false, error: "No page to draw on." };
  if (items.size >= MAX_ITEMS) return { ok: false, error: `${MAX_ITEMS} drawings are already on screen. Erase some first.` };
  if (spec.el?.closest(OFF)) return { ok: false, error: "That is inside an account or key panel; you may not draw there." };
  if (privateShown()) return { ok: false, error: "An account or key panel is open. Drawing is off until it closes." };
  const id = `d${++seq}`;
  const g = el("g", { "data-draw-id": id });
  s.appendChild(g);
  const now = Date.now();
  const secs = Number(spec.seconds);
  const it: Item = { ...spec, id, created: now, g, expires: secs > 0 ? now + Math.min(secs, 3600) * 1000 : undefined };
  items.set(id, it);
  render(it);
  if (it.expires) window.setTimeout(() => erase(id), it.expires - now);
  return { ok: true, item: describeItem(it) };
}

/** Erase one item by id; returns whether it existed. */
export function erase(id: string) {
  const it = items.get(id);
  if (!it) return false;
  it.g.remove();
  items.delete(id);
  return true;
}

export function eraseAll() {
  const n = items.size;
  [...items.keys()].forEach(erase);
  return n;
}

export function listDrawings(): Drawn[] {
  return [...items.values()].map((it) => { render(it); return describeItem(it); });
}

export function drawingCount() { return items.size; }
