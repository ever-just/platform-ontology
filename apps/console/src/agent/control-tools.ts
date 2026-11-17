import { settle } from "../core/screen";
import type { ToolDef, ToolResult } from "./tools";

// The control directory: every button, field and switch on the console page, under a stable id the
// AI can list, press and set. Ids come from data-control attributes (kept above 95% by
// scripts/control-coverage.mjs); anything untagged still appears under a derived id.

export const CONTROL_TOOLS: ToolDef[] = [
  {
    name: "list_controls",
    description: "List the buttons, fields and switches visible on the console right now, with id, label, kind and state. Pass query to filter by words in the id or label. Use it to find a control before press_control or set_control.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Words to match in the id or label" }, limit: { type: "number" } } },
  },
  {
    name: "press_control",
    description: "Press a button or link on the console by its id from list_controls, exactly as if the person clicked it.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "set_control",
    description: "Type into a field, pick an option in a menu, or tick a checkbox on the console, by its id from list_controls. Value is text, an option value, or true or false for a checkbox.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, value: { type: ["string", "number", "boolean"] } }, required: ["id", "value"] },
  },
];

const QUERY = "[data-control], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch]";

export type Control = { id: string; label: string; kind: string; state?: Record<string, unknown>; where?: string };

const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim().slice(0, 80);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function visible(el: HTMLElement) {
  // Account and credential views carry data-agent-off: no agent may see or press anything there.
  if (el.closest("[hidden], [aria-hidden=true], .voice, [data-agent-off]")) return false;
  return el.getClientRects().length > 0;
}

function labelOf(el: HTMLElement) {
  const byId = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : "";
  const field = el as HTMLInputElement;
  const isField = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  return clean(el.getAttribute("aria-label") || el.title || byId || (isField && field.placeholder) || el.closest("label")?.textContent || (!isField && el.textContent) || field.name || "");
}

function kindOf(el: HTMLElement) {
  const t = el.tagName.toLowerCase();
  if (t === "input") return (el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio" ? (el as HTMLInputElement).type : "field";
  if (t === "textarea") return "field";
  if (t === "select") return "menu";
  return el.getAttribute("role") || (t === "a" ? "link" : "button");
}

function stateOf(el: HTMLElement) {
  const s: Record<string, unknown> = {};
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") s.disabled = true;
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) s.checked = el.checked;
  else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) s.value = el.value.slice(0, 60);
  if (el instanceof HTMLSelectElement) { s.value = el.value; s.options = [...el.options].slice(0, 20).map((o) => o.value); }
  for (const a of ["aria-pressed", "aria-selected", "aria-checked", "aria-expanded"]) {
    const v = el.getAttribute(a);
    if (v !== null) s[a.slice(5)] = v === "true";
  }
  return Object.keys(s).length ? s : undefined;
}

/** Scan the page. Repeated ids (rows in a list) get a #2, #3 suffix in page order. */
export function scanControls(): { control: Control; el: HTMLElement }[] {
  if (typeof document === "undefined") return [];
  const seen = new Map<string, number>();
  const out: { control: Control; el: HTMLElement }[] = [];
  document.querySelectorAll<HTMLElement>(QUERY).forEach((el) => {
    if (!visible(el)) return;
    // An untagged element inside a tagged one is part of that control.
    if (!el.dataset.control && el.parentElement?.closest("[data-control]")) return;
    const label = labelOf(el);
    const where = el.closest<HTMLElement>("[data-cap]")?.dataset.cap || el.closest<HTMLElement>("[data-scope]")?.dataset.scope;
    let id = el.dataset.control || `auto.${where ? where + "." : ""}${slug(label) || kindOf(el)}`;
    const n = (seen.get(id) || 0) + 1;
    seen.set(id, n);
    if (n > 1) id = `${id}#${n}`;
    out.push({ el, control: { id, label, kind: kindOf(el), state: stateOf(el), ...(where ? { where } : {}) } });
  });
  return out;
}

function ring(el: HTMLElement) {
  el.classList.remove("ai-look");
  void el.offsetWidth;
  el.classList.add("ai-look");
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  window.setTimeout(() => el.classList.remove("ai-look"), 2000);
}

/** React tracks input values itself, so set them through the native setter and fire the events. */
function setNative(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const none: ToolResult = { ok: false, error: "The console is not on this page, so there are no controls to drive." };

export async function controlCall(name: string, a: Record<string, any>): Promise<ToolResult | null> {
  if (!CONTROL_TOOLS.some((t) => t.name === name)) return null;
  if (typeof document === "undefined") return none;
  const all = scanControls();
  if (name === "list_controls") {
    const words = String(a.query || "").toLowerCase().split(/\s+/).filter(Boolean);
    const hits = all.map((x) => x.control).filter((c) => words.every((w) => `${c.id} ${c.label} ${c.where || ""}`.toLowerCase().includes(w)));
    const limit = Math.max(1, Math.min(Number(a.limit) || 60, 200));
    return { ok: true, count: hits.length, controls: hits.slice(0, limit), more: Math.max(0, hits.length - limit) };
  }
  const hit = all.find((x) => x.control.id === a.id) || all.find((x) => x.control.id.split("#")[0] === a.id);
  if (!hit) return { ok: false, error: `No visible control "${a.id}". Call list_controls to see what is on screen; open the right panel with show first if it is not showing.` };
  const { el, control } = hit;
  if (control.state?.disabled) return { ok: false, error: `${control.id} is disabled right now.` };
  ring(el);
  if (name === "press_control") {
    el.click();
  } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const want = a.value === true || a.value === "true" || a.value === 1;
    if (el.checked !== want) el.click();
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === String(a.value))) {
      return { ok: false, error: `No option "${a.value}". Options: ${[...el.options].map((o) => o.value).join(", ")}` };
    }
    setNative(el, String(a.value));
  } else {
    return { ok: false, error: `${control.id} is a ${control.kind}; use press_control.` };
  }
  await settle();
  return { ok: true, control: control.id, label: control.label, state: stateOf(el) };
}
