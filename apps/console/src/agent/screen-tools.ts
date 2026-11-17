import { personSees } from "../ai/stage";
import type { ScopeDef } from "../core/types";
import { getSession } from "../core/harness";
import { INSPECTOR_TABS, type InspectorTab, highlight, inspectorTab, screen, settle } from "../core/screen";
import type { ToolDef, ToolResult } from "./tools";

// Tools that see and drive the console screen itself: which pane and view are showing, what the
// inspector has open, and moving between them. They work only where the console is on the page.

export const SCREEN_TOOLS: ToolDef[] = [
  { name: "describe_screen", description: "What the console shows right now: the pane, the chart view and its tabs, which capability the side panel has open, and person_sees (white page or console). Works even while the white page covers the console. Call this before talking about the screen.", inputSchema: { type: "object", properties: {} } },
  {
    name: "show",
    description: "Change what the console shows. Pass view to switch the chart tab (ids from describe_screen), capability to open a capability's side panel, pane to switch between the overview and the capability list on phones, tab to switch the open side panel to its live, record, about or log tab, or close true to close the side panel. Combine them, for example capability plus tab.",
    inputSchema: { type: "object", properties: {
      view: { type: "string", description: "Chart tab id" },
      capability: { type: "string", description: "Capability id to open" },
      tab: { type: "string", enum: [...INSPECTOR_TABS], description: "Side panel tab" },
      pane: { type: "string", enum: ["overview", "caps"] },
      close: { type: "boolean" },
    } },
  },
  {
    name: "point_at",
    description: "Highlight a capability row or a chart tab for a few seconds so the person can see what you mean.",
    inputSchema: { type: "object", properties: { capability: { type: "string" }, view: { type: "string" } } },
  },
];

const none: ToolResult = { ok: false, error: "The console is not on this page. Open https://platformontology.lol/ to see and drive the screen." };

const withTab = (st: ReturnType<NonNullable<ReturnType<typeof screen>>["state"]>) =>
  st.inspector && inspectorTab() ? { ...st, inspector: { ...st.inspector, tab: inspectorTab()!.get() } } : st;

export async function screenCall(name: string, a: Record<string, any>, find: (id: unknown) => ScopeDef | undefined): Promise<ToolResult | null> {
  if (!SCREEN_TOOLS.some((t) => t.name === name)) return null;
  const s = screen();
  if (!s) return none;
  switch (name) {
    case "describe_screen": {
      const st = withTab(s.state());
      const cap = st.inspector && find(st.inspector.id);
      return {
        ok: true, ...st,
        person_sees: personSees(),
        ...(personSees() === "white page" ? { note: "The console is behind the white page and fully under your control; any show, point_at or control action lifts the white page." } : {}),
        inspector: cap ? { id: cap.id, name: cap.name, tab: st.inspector?.tab, summary: cap.summary, state: getSession(cap.id).state, records: getSession(cap.id).count } : null,
      };
    }
    case "show": {
      const done: string[] = [];
      const looks: [string, "cap" | "view" | "tab"][] = [];
      if (a.close) { s.close(); done.push("closed the side panel"); }
      if (a.pane === "overview" || a.pane === "caps") { s.setPane(a.pane); done.push(`pane ${a.pane}`); }
      if (a.view) {
        if (!s.setView(String(a.view))) return { ok: false, error: `No view "${a.view}". Views: ${s.state().views.map((v) => v.id).join(", ")}.` };
        looks.push([String(a.view), "view"]);
        done.push(`view ${a.view}`);
      }
      if (a.capability) {
        const cap = find(a.capability);
        if (!cap || !s.select(cap.id)) return { ok: false, error: `No capability "${a.capability}". Call list_capabilities to find ids.` };
        looks.push([cap.id, "cap"]);
        done.push(`opened ${cap.name}`);
      }
      if (a.tab) {
        const t = String(a.tab).toLowerCase() as InspectorTab;
        if (!INSPECTOR_TABS.includes(t)) return { ok: false, error: `No tab "${a.tab}". Tabs: ${INSPECTOR_TABS.join(", ")}.` };
        await settle(); // the side panel may have just opened
        const ti = inspectorTab();
        if (!ti) return { ok: false, error: "No side panel is open. Pass capability too." };
        ti.set(t);
        looks.push([t, "tab"]);
        done.push(`${t} tab`);
      }
      if (!done.length) return { ok: false, error: "Pass view, capability, tab, pane or close." };
      await settle();
      const lit = looks.filter(([id, k]) => highlight(id, k)).map(([id]) => id);
      return { ok: true, did: done, highlighted: lit, screen: withTab(s.state()) };
    }
    case "point_at": {
      const cap = a.capability ? find(a.capability) : undefined;
      if (a.capability && !cap) return { ok: false, error: `No capability "${a.capability}".` };
      const hit = cap ? highlight(cap.id) : a.view ? highlight(String(a.view), "view") : false;
      return hit ? { ok: true } : { ok: false, error: "That is not visible right now. Use show to open it first." };
    }
  }
  return none;
}
