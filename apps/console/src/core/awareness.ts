// What the person is doing on the page right now, for the voice agent: where the pointer is and what
// it is over, what has focus, what is selected, how far the page is scrolled, and which video feed
// (camera or screen share) the agent is currently being shown. Nothing here leaves the tab on its own;
// the agent reads it through the look tool and the live context notes.

type Pt = { x: number; y: number; t: number; el: Element | null };
let pt: Pt = { x: 0, y: 0, t: 0, el: null };
let started = false;
let seeing: { id: string; name: string } | null = null;

/** Start tracking the pointer (once, browser only). */
export function startAwareness() {
  if (started || typeof window === "undefined") return;
  started = true;
  const move = (e: PointerEvent) => { pt = { x: e.clientX, y: e.clientY, t: Date.now(), el: e.target as Element | null }; };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerdown", move, { passive: true });
}

/** Account and credential views carry data-agent-off: the agent never reads anything inside them. */
const OFF = "[data-agent-off], input[type=password], [autocomplete~=one-time-code]";
const isOff = (n: Node | null) => {
  const el = n instanceof Element ? n : n?.parentElement;
  return !!el?.closest(OFF);
};

/** A short plain description of one element: its control id, label and visible text. */
export function describeEl(el: Element | null): Record<string, string> | null {
  if (!el || !(el instanceof Element)) return null;
  if (isOff(el)) return { tag: "private", note: "an account or key panel the assistant may not read" };
  const ctl = el.closest("[data-control]");
  const lab = el.closest("[aria-label]");
  const hit = ctl || lab || el;
  const text = (hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const out: Record<string, string> = { tag: hit.tagName.toLowerCase() };
  if (ctl) out.control = ctl.getAttribute("data-control")!;
  const label = (ctl || lab)?.getAttribute("aria-label") || hit.getAttribute("title") || "";
  if (label) out.label = label.slice(0, 80);
  if (text) out.text = text;
  const region = el.closest("aside, header, main, nav, section, [role=dialog]");
  const rl = region?.getAttribute("aria-label");
  if (rl) out.in = rl;
  return out;
}

export function pointerNow() {
  if (typeof window === "undefined" || !pt.t) return null;
  const w = window.innerWidth, h = window.innerHeight;
  const sideX = pt.x < w / 3 ? "left" : pt.x > (2 * w) / 3 ? "right" : "center";
  const sideY = pt.y < h / 3 ? "top" : pt.y > (2 * h) / 3 ? "bottom" : "middle";
  return {
    x: Math.round(pt.x), y: Math.round(pt.y), where: `${sideY} ${sideX}`,
    idle_s: Math.round((Date.now() - pt.t) / 1000),
    over: describeEl(document.elementFromPoint(pt.x, pt.y) || pt.el),
  };
}

export function pageNow() {
  if (typeof window === "undefined") return null;
  const s = window.getSelection?.();
  // Never pass on a selection that touches a private panel (for example a key being copied).
  const priv = !!s && s.rangeCount > 0 && (isOff(s.anchorNode) || isOff(s.focusNode) || [...document.querySelectorAll("[data-agent-off]")].some((el) => s.containsNode(el, true)));
  const sel = priv ? "" : String(s || "").trim();
  const focus = document.activeElement && document.activeElement !== document.body ? describeEl(document.activeElement) : null;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrolled: `${Math.round((window.scrollY / max) * 100)}%`,
    visible: document.visibilityState === "visible",
    focus, selected: sel ? sel.slice(0, 200) : undefined,
  };
}

/** Which video feed the agent is being shown, set by the live session's frame sender. */
export const setSeeing = (s: { id: string; name: string } | null) => { seeing = s; };
export const seeingNow = () => seeing;
