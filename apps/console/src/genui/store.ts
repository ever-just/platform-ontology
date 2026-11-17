import { MessageProcessor } from "@a2ui/web_core/v0_9";
import type { SurfaceModel } from "@a2ui/web_core/v0_9";
import { PO_CATALOG_ID, PO_COMPONENTS, poCatalog } from "./catalog";

// One A2UI message processor for this tab. The voice AI's show_ui tool turns its plain block list
// into A2UI messages (createSurface, updateComponents, updateDataModel) and feeds them here; the chat
// subscribes and renders each surface with <A2uiSurface>. Button presses come back through onAction.

export type UiButton = { label: string; do?: "say" | "start" | "stop" | "press"; id?: string; say?: string; primary?: boolean };
export type UiBlock = {
  type: "text" | "stat" | "reading" | "bars" | "field" | "buttons";
  text?: string; tone?: "plain" | "muted" | "good" | "bad";
  label?: string; value?: string | number; unit?: string;
  capability?: string;
  items?: { label: string; value: number }[];
  name?: string; placeholder?: string;
  buttons?: UiButton[];
};
export type UiPress = { surface: string; label: string; button: UiButton; form: Record<string, string> };

type AnySurface = SurfaceModel<any>;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => { try { f(); } catch { /* a listener never breaks the agent */ } });
const order: string[] = [];
const buttons = new Map<string, UiButton>();
let onPress: ((p: UiPress) => void) | null = null;

const processor = new MessageProcessor([poCatalog], (a: { name: string; surfaceId: string; context?: Record<string, unknown> }) => {
  const b = buttons.get(`${a.surfaceId}/${a.name}`);
  if (!b) return;
  const form: Record<string, string> = {};
  Object.entries(a.context || {}).forEach(([k, v]) => { if (v != null) form[k] = String(v); });
  onPress?.({ surface: a.surfaceId, label: b.label, button: b, form });
});
processor.onSurfaceCreated((s: AnySurface) => { if (!order.includes(s.id)) order.push(s.id); ping(); });
processor.onSurfaceDeleted((id: string) => { const i = order.indexOf(id); if (i >= 0) order.splice(i, 1); ping(); });

export function onSurfaces(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export const getSurface = (id: string): AnySurface | undefined => processor.getSurface(id);
export const surfaceIds = () => [...order];
export function setPressHandler(f: ((p: UiPress) => void) | null) { onPress = f; }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "field";

/** Build the A2UI messages for one surface from the AI's block list. Pure, so it can be tested. */
export function buildMessages(surfaceId: string, title: string | undefined, blocks: UiBlock[], fresh: boolean) {
  const comps: Record<string, unknown>[] = [];
  const top: string[] = [];
  const data: Record<string, string> = {};
  const fields: string[] = [];
  const acts: [string, UiButton][] = [];
  blocks.slice(0, 12).forEach((b, i) => {
    const id = `b${i}`;
    switch (b.type) {
      case "text": comps.push({ id, component: "Text", text: String(b.text ?? ""), ...(b.tone ? { tone: b.tone } : {}) }); break;
      case "stat": comps.push({ id, component: "Stat", label: String(b.label ?? ""), value: String(b.value ?? ""), ...(b.unit ? { unit: b.unit } : {}) }); break;
      case "reading": comps.push({ id, component: "Reading", capability: String(b.capability ?? ""), ...(b.label ? { title: b.label } : {}) }); break;
      case "bars": comps.push({ id, component: "Bars", items: (b.items || []).slice(0, 24).map((x) => ({ label: String(x.label), value: Number(x.value) || 0 })) }); break;
      case "field": {
        let key = slug(b.name || b.label || `field${i}`);
        while (fields.includes(key)) key += "_";
        fields.push(key);
        data[key] = b.value != null ? String(b.value) : "";
        comps.push({ id, component: "Field", label: String(b.label ?? key), value: { path: `/${key}` }, ...(b.placeholder ? { placeholder: b.placeholder } : {}) });
        break;
      }
      case "buttons": {
        const ids = (b.buttons || []).slice(0, 4).map((x, j) => {
          const bid = `${id}_${j}`;
          acts.push([bid, x]);
          comps.push({ id: bid, component: "Button", label: String(x.label), action: { event: { name: bid } }, ...(x.primary ? { primary: true } : {}) });
          return bid;
        });
        comps.push({ id, component: "Row", children: ids });
        break;
      }
      default: return;
    }
    top.push(id);
  });
  // Buttons carry every field's current value, so a form submit reaches the AI with what was typed.
  const ctx = Object.fromEntries(fields.map((k) => [k, { path: `/${k}` }]));
  comps.forEach((c) => { if (c.component === "Button" && fields.length) (c.action as { event: { context?: unknown } }).event.context = ctx; });
  comps.unshift({ id: "root", component: "Card", ...(title ? { title } : {}), children: top });
  const msgs: Record<string, unknown>[] = [];
  if (fresh) msgs.push({ version: "v0.9", createSurface: { surfaceId, catalogId: PO_CATALOG_ID } });
  msgs.push({ version: "v0.9", updateComponents: { surfaceId, components: comps } });
  if (fields.length) msgs.push({ version: "v0.9", updateDataModel: { surfaceId, path: "/", value: data } });
  return { msgs, acts, count: top.length };
}

let n = 0;
/** Show (or replace) a surface in the chat. verified is true only when the processor accepted every
 *  message and the surface now exists with its root component. */
export function showSurface(args: { surface?: string; title?: string; blocks: UiBlock[] }) {
  const want = args.surface ? slug(args.surface) : "";
  const surfaceId = want || `ui${++n}`;
  const fresh = !processor.getSurface(surfaceId);
  const { msgs, acts, count } = buildMessages(surfaceId, args.title, args.blocks || [], fresh);
  if (!count) return { ok: false, surfaceId, errors: ["No blocks. Pass at least one block."], verified: false };
  if (!fresh) [...buttons.keys()].filter((k) => k.startsWith(surfaceId + "/")).forEach((k) => buttons.delete(k));
  acts.forEach(([bid, b]) => buttons.set(`${surfaceId}/${bid}`, b));
  const errs = processor.processMessagesWithErrors(msgs).map((e: any) => String(e?.error?.message || e?.message || JSON.stringify(e)).slice(0, 200));
  const s = processor.getSurface(surfaceId) as any;
  const has = !!s && (typeof s.componentsModel?.get === "function" ? !!s.componentsModel.get("root") : true);
  if (!fresh) { const i = order.indexOf(surfaceId); if (i >= 0) order.splice(i, 1); order.push(surfaceId); }
  ping();
  return { ok: !errs.length && has, surfaceId, blocks: count, replaced: !fresh, errors: errs.length ? errs : undefined, verified: !errs.length && has };
}

export function clearSurface(id?: string) {
  const ids = id ? [slug(id)] : surfaceIds();
  const gone: string[] = [];
  ids.forEach((sid) => {
    if (!processor.getSurface(sid)) return;
    processor.processMessagesWithErrors([{ version: "v0.9", deleteSurface: { surfaceId: sid } }]);
    [...buttons.keys()].filter((k) => k.startsWith(sid + "/")).forEach((k) => buttons.delete(k));
    gone.push(sid);
  });
  ping();
  const left = gone.filter((sid) => processor.getSurface(sid));
  return { ok: gone.length > 0 && !left.length, cleared: gone, verified: gone.length > 0 && !left.length };
}

export const CATALOG_NAMES = PO_COMPONENTS;
