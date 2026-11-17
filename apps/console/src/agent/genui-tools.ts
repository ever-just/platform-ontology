import type { UiBlock } from "../genui/store";
import type { ToolDef, ToolResult } from "./tools";

// show_ui and clear_ui: the voice AI draws small cards in the chat from the approved "po" A2UI
// catalog (text, stat tiles, live readings, bar charts, form fields, button rows). It sends a plain
// block list; the tool turns it into A2UI messages and the chat renders them. No code, no markup.

export const GENUI_TOOLS: ToolDef[] = [
  {
    name: "show_ui",
    description: "Show a small card in the chat built from approved parts, for numbers, comparisons, live readings, a short form or a row of buttons. Keep it under 8 blocks. Give surface a name to replace that card later. Buttons either send you a note (do say) or run start, stop or press on an id.",
    inputSchema: { type: "object", properties: {
      surface: { type: "string", description: "Card name, for example battery. Same name replaces the card." },
      title: { type: "string" },
      blocks: { type: "array", description: "The card's parts, top to bottom", items: { type: "object", properties: {
        type: { type: "string", enum: ["text", "stat", "reading", "bars", "field", "buttons"] },
        text: { type: "string", description: "text: the sentence" },
        tone: { type: "string", enum: ["plain", "muted", "good", "bad"] },
        label: { type: "string", description: "stat, field or reading label" },
        value: { type: "string", description: "stat value, or a field's starting text" },
        unit: { type: "string" },
        capability: { type: "string", description: "reading: capability id whose live value and sparkline to show" },
        items: { type: "array", description: "bars: label and number per bar", items: { type: "object", properties: { label: { type: "string" }, value: { type: "number" } }, required: ["label", "value"] } },
        name: { type: "string", description: "field: key the typed text comes back under" },
        placeholder: { type: "string" },
        buttons: { type: "array", description: "buttons: up to 4", items: { type: "object", properties: {
          label: { type: "string" },
          do: { type: "string", enum: ["say", "start", "stop", "press"], description: "Default say" },
          id: { type: "string", description: "Capability id for start or stop, control id for press" },
          say: { type: "string", description: "What the note to you says when pressed" },
          primary: { type: "boolean" },
        }, required: ["label"] } },
      }, required: ["type"] } },
    }, required: ["blocks"] },
  },
  {
    name: "clear_ui",
    description: "Remove a card you showed in the chat, or every card when surface is left out.",
    inputSchema: { type: "object", properties: { surface: { type: "string" } } },
  },
];

export async function genuiCall(name: string, a: Record<string, any>): Promise<ToolResult | null> {
  if (name !== "show_ui" && name !== "clear_ui") return null;
  // Loaded on first use: the A2UI renderer needs a DOM and stays out of the tools' import graph.
  const { clearSurface, showSurface } = await import("../genui/store");
  if (name === "show_ui") {
    let blocks = a.blocks as unknown;
    if (typeof blocks === "string") { try { blocks = JSON.parse(blocks); } catch { blocks = []; } }
    const r = showSurface({ surface: a.surface, title: a.title, blocks: Array.isArray(blocks) ? (blocks as UiBlock[]) : [] });
    return { ...r, said: r.ok ? `I put a card in the chat${a.title ? `: ${a.title}` : ""}.` : `The card did not show: ${(r.errors || []).join("; ")}` };
  }
  if (name === "clear_ui") {
    const r = clearSurface(a.surface);
    return { ...r, said: r.ok ? (r.cleared.length > 1 ? `I removed ${r.cleared.length} cards.` : "I removed the card.") : "There was no card to remove." };
  }
  return null;
}
