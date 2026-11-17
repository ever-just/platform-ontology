import { DRAW_COLORS, type DrawKind, type DrawSpec, type Pt, draw, eraseAll, erase, listDrawings, resolveAnchor } from "../core/draw-layer";
import type { ToolDef, ToolResult } from "./tools";

// Tools that let the voice agent write and draw on the screen in real time: text, boxes, circles,
// lines, arrows, freehand paths and highlights that follow a page element. Positions are percent of
// the visible window so the agent never needs pixel sizes. Every result carries the item id and its
// measured on-screen box, because the agent cannot see its own overlay in camera or screen frames.

const KINDS: DrawKind[] = ["text", "arrow", "box", "circle", "line", "path", "highlight"];
const pct = { type: "number", description: "Percent of the visible window, 0 to 100" };

export const DRAW_TOOLS: ToolDef[] = [
  {
    name: "draw",
    description: "Write or draw on the person's screen, live, on a layer over the page that never blocks clicks. kind text writes words at x,y (or under the element in to). highlight boxes an element and follows it as the page scrolls. arrow points from x,y (or near the element) to the element in to, or from points[0] to points[1]. box and circle use x,y,w,h, or wrap the element in to. line goes from points[0] to points[1]. path is freehand through points. Positions are percent of the visible window (0,0 top left; 100,100 bottom right). to is a control id from list_controls or a CSS selector. seconds makes it fade away; without it, it stays until erase. Returns the drawing id and its on-screen box, since you cannot see your drawings in video frames.",
    inputSchema: { type: "object", properties: {
      kind: { type: "string", enum: KINDS },
      text: { type: "string", description: "For text: the words to write" },
      to: { type: "string", description: "Element to highlight, point at, wrap or write under: a control id or CSS selector" },
      x: pct, y: pct, w: pct, h: pct,
      points: { type: "array", items: { type: "array", items: { type: "number" } }, description: "For line, arrow and path: [[x,y], ...] in percent of the window" },
      label: { type: "string", description: "Short caption shown next to a shape" },
      color: { type: "string", enum: DRAW_COLORS, description: "Theme color; default accent" },
      size: { type: "number", description: "Text size in pixels, 10 to 64. Default 16" },
      width: { type: "number", description: "Stroke width in pixels, 1 to 12. Default 3" },
      fill: { type: "boolean", description: "Tint the inside of a box or circle" },
      seconds: { type: "number", description: "Fade after this many seconds" },
    }, required: ["kind"] },
  },
  {
    name: "erase",
    description: "Remove your drawings from the screen: one by id, or all of them.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, all: { type: "boolean" } } },
  },
  {
    name: "list_drawings",
    description: "Every drawing you have on screen now, with its id, what it says, its on-screen box in pixels, and whether it is visible, off screen, hidden, or its element is gone.",
    inputSchema: { type: "object", properties: {} },
  },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export async function drawCall(name: string, a: Record<string, any>): Promise<ToolResult | null> {
  if (!DRAW_TOOLS.some((t) => t.name === name)) return null;
  if (typeof window === "undefined" || typeof document === "undefined") return { ok: false, error: "There is no page to draw on here." };
  const vw = window.innerWidth, vh = window.innerHeight;
  const px = (v: unknown, axis: "x" | "y") => { const n = num(v); return Number.isFinite(n) ? (clamp(n, -10, 110) / 100) * (axis === "x" ? vw : vh) : undefined; };
  const view = { width: vw, height: vh };

  switch (name) {
    case "list_drawings": {
      const items = listDrawings();
      return { ok: true, count: items.length, drawings: items, window: view };
    }
    case "erase": {
      if (a.all) return { ok: true, erased: eraseAll() };
      const id = String(a.id || "");
      return erase(id) ? { ok: true, erased: 1, id } : { ok: false, error: `No drawing "${id}". Call list_drawings.` };
    }
    case "draw": {
      const kind = String(a.kind || "") as DrawKind;
      if (!KINDS.includes(kind)) return { ok: false, error: `kind must be one of ${KINDS.join(", ")}.` };
      const spec: DrawSpec = {
        kind,
        color: DRAW_COLORS.includes(a.color) ? a.color : undefined,
        width: Number.isFinite(num(a.width)) ? clamp(num(a.width), 1, 12) : undefined,
        size: Number.isFinite(num(a.size)) ? clamp(num(a.size), 10, 64) : undefined,
        fill: !!a.fill,
        label: a.label ? String(a.label).slice(0, 80) : undefined,
        seconds: Number.isFinite(num(a.seconds)) ? clamp(num(a.seconds), 0.5, 3600) : undefined,
      };
      let target: Element | undefined;
      if (a.to) {
        const r = resolveAnchor(String(a.to));
        if (!r.el) return { ok: false, error: r.error };
        target = r.el;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      const pts: Pt[] = Array.isArray(a.points)
        ? a.points.slice(0, 400).map((p: unknown) => (Array.isArray(p) ? [px(p[0], "x"), px(p[1], "y")] : [undefined, undefined])).filter((p: (number | undefined)[]): p is Pt => p[0] !== undefined && p[1] !== undefined)
        : [];
      const x = px(a.x, "x"), y = px(a.y, "y"), w = px(a.w, "x"), h = px(a.h, "y");

      switch (kind) {
        case "text": {
          const text = String(a.text || a.label || "").trim().slice(0, 200);
          if (!text) return { ok: false, error: "text needs the words to write in text." };
          Object.assign(spec, { text, label: undefined });
          if (target) Object.assign(spec, { el: target, anchor: String(a.to) });
          else if (x === undefined || y === undefined) return { ok: false, error: "text needs x and y, or to." };
          else Object.assign(spec, { x, y });
          break;
        }
        case "highlight": {
          if (!target) return { ok: false, error: "highlight needs to: a control id from list_controls or a CSS selector." };
          Object.assign(spec, { el: target, anchor: String(a.to) });
          break;
        }
        case "arrow":
        case "line": {
          if (target && kind === "arrow") {
            const b = target.getBoundingClientRect();
            let from: Pt = pts[0] || (x !== undefined && y !== undefined ? [x, y] : [b.left - 90, b.top - 70]);
            if (!pts[0] && x === undefined) {
              // No start given: come in from whichever side has room.
              const fx = b.left > 120 ? b.left - 90 : b.right + 90;
              const fy = b.top > 100 ? b.top - 70 : b.bottom + 70;
              from = [clamp(fx, 8, vw - 8), clamp(fy, 8, vh - 8)];
            }
            Object.assign(spec, { el: target, anchor: String(a.to), points: [from] });
          } else {
            if (pts.length < 2) return { ok: false, error: `${kind} needs points [[x1,y1],[x2,y2]]${kind === "arrow" ? ", or to" : ""}.` };
            spec.points = pts.slice(0, 2);
          }
          break;
        }
        case "path": {
          if (pts.length < 2) return { ok: false, error: "path needs at least two points." };
          spec.points = pts;
          break;
        }
        case "box":
        case "circle": {
          if (target) {
            const b = target.getBoundingClientRect();
            const pad = kind === "circle" ? 14 : 6;
            Object.assign(spec, { x: b.left - pad, y: b.top - pad, w: b.width + pad * 2, h: b.height + pad * 2, anchor: String(a.to) });
          } else if ([x, y, w, h].some((v) => v === undefined)) return { ok: false, error: `${kind} needs x, y, w and h, or to.` };
          else Object.assign(spec, { x, y, w, h });
          break;
        }
      }
      const r = draw(spec);
      if (!r.ok) return r;
      return {
        ok: true, id: r.item.id, drawn: r.item, window: view,
        note: "You cannot see this layer in video frames. Its box above is where it is, in pixels. erase it by id when done.",
      };
    }
  }
  return null;
}
