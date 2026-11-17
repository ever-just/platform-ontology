import type { ScopeDef, Session } from "../core/types";
import { allSessions, getSession, isActive } from "../core/harness";
import { pageNow, pointerNow, seeingNow } from "../core/awareness";
import { inspectorTab, screen } from "../core/screen";
import { actionHistory, listLoops, recall, startLoop, stopAllLoops, stopLoop } from "../core/agent-memory";
import { drawingCount, listDrawings } from "../core/draw-layer";
import type { ToolDef, ToolResult } from "./tools";

// Self awareness for the voice agent: what it can do (get_abilities), what is going on across every
// running capability grouped by meaning (get_situation), and where the person is on the page (look).

export const AWARE_TOOLS: ToolDef[] = [
  { name: "get_abilities", description: "Your own abilities: every tool you have, grouped by what it does, plus what you can see and hear right now. Call it when unsure whether you can do something.", inputSchema: { type: "object", properties: {} } },
  { name: "get_situation", description: "Everything running right now, grouped by meaning (place, motion, surroundings, capture, device, fingerprint, link, identity, reach), with each capability's latest headline values and rate, and pairs of running capabilities worth reading together. Use it to infer what is happening around the person, then evaluate_insight on a pair to back it up.", inputSchema: { type: "object", properties: {} } },
  { name: "get_my_history", description: "What you yourself have done in this browser, across visits: every tool you ran, the changes you made (started, stopped, set, pressed), and what failed with the error. Use it to avoid repeating a failure, to undo or redo something, or when asked what you did.", inputSchema: { type: "object", properties: {
    minutes: { type: "number", description: "How far back, default a week" },
    failed_only: { type: "boolean" }, tool: { type: "string", description: "Only this tool" },
    include_loops: { type: "boolean", description: "Include runs made by your loops" }, limit: { type: "number", description: "Default 25, at most 80" },
  } } },
  { name: "recall_conversation", description: "What was said between you and this person earlier, including previous visits. Pass query to find a topic.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number", description: "Default 20" } } } },
  { name: "start_loop", description: "Keep running one of your tools on an interval, for as long as the page is open (no time limit), to watch for something or repeat work. With until, you are told when the condition is met: op eq, ne, gt, lt or contains stops the loop on the first hit; op changes keeps going and tells you every time the value changes. path picks a field of the tool's result with dots, for example status.0.state. Without until it runs max_runs times (or until stopped) and reports at the end.", inputSchema: { type: "object", properties: {
    tool: { type: "string", description: "Tool to run, for example read_stream or get_situation" },
    args: { type: "object", description: "Arguments for that tool" },
    every_s: { type: "number", description: "Seconds between runs, 2 to 3600. Default 10" },
    until: { type: "object", properties: { path: { type: "string" }, op: { type: "string", enum: ["eq", "ne", "gt", "lt", "contains", "changes"] }, value: { type: "string" } }, required: ["path", "op"] },
    max_runs: { type: "number", description: "Optional cap on runs" },
    note: { type: "string", description: "Why you started it, repeated back when it fires" },
  }, required: ["tool"] } },
  { name: "stop_loop", description: "Stop one loop by id, or all of them.", inputSchema: { type: "object", properties: { id: { type: "string" }, all: { type: "boolean" } } } },
  { name: "list_loops", description: "Your loops that are running now.", inputSchema: { type: "object", properties: {} } },
  { name: "look", description: "Where the person is on the page: pointer position and what is under it, focused field, selected text, scroll, the screen view and side panel, whether the tab is visible, which video feed you are being shown, and the drawings you have on screen with their boxes.", inputSchema: { type: "object", properties: {} } },
];

const GROUPS: Record<string, string> = {
  place: "where the device is", motion: "how it moves and is held", surroundings: "light, sound and the room",
  capture: "camera, mic and screen", device: "the hardware", fingerprint: "what makes this browser unique",
  link: "network and nearby devices", identity: "who the person is", reach: "ways to reach out (notify, share, vibrate)",
};

const TOOL_GROUPS: [string, RegExp][] = [
  ["Know yourself and the person", /^(get_abilities|get_situation|look)$/],
  ["Find and run capabilities", /^(list_capabilities|describe_capability|start_capability|stop_capability|stop_all|get_status|read_stream|run_action|set_param)$/],
  ["Remember and repeat", /^(get_my_history|recall_conversation|start_loop|stop_loop|list_loops)$/],
  ["Run long jobs", /^(turn_on_everything|run_job|list_jobs|stop_job|ask_for_click)$/],
  ["Infer across data", /^(get_history|get_activity|evaluate_insight|get_saved_readings)$/],
  ["See and drive the screen", /^(describe_screen|show|point_at|list_controls|press_control|set_control|draw|erase|list_drawings)$/],
  ["Your own panel", /^(set_transcript)$/],
  ["Reach beyond the page", /^(web_search|sequential_thinking|think_in_background|get_background_thinking|run_code)$/],
];

export function groupTools(tools: ToolDef[]) {
  const out: Record<string, string[]> = {};
  tools.forEach((t) => {
    const g = TOOL_GROUPS.find(([, re]) => re.test(t.name))?.[0] || "Other";
    (out[g] ||= []).push(t.name);
  });
  return out;
}

/** The short self description injected into the system instruction at session start. */
export function abilitiesBrief(tools: ToolDef[], scopes: ScopeDef[]) {
  const g = groupTools(tools);
  const counts = new Map<string, number>();
  scopes.forEach((s) => { if (!s.reference) counts.set(s.domain, (counts.get(s.domain) || 0) + 1); });
  const lines = Object.entries(g).map(([k, v]) => `- ${k}: ${v.join(", ")}`);
  const domains = Object.entries(GROUPS).map(([d, what]) => `${d} (${counts.get(d) || 0}, ${what})`).join("; ");
  return [
    "YOUR ABILITIES (you know these from the start, no need to look them up):",
    ...lines,
    `Data you can reach, by group: ${domains}.`,
    "When the camera or screen capture is running you also receive its frames about once a second, so you can describe what it shows. Short notes marked [screen update] tell you when the view changes; do not answer them out loud.",
    "You remember: get_my_history lists what you did and what failed (check it before retrying), recall_conversation finds what was said before. You can run long jobs: start_loop repeats any tool with no time limit and tells you when a condition is met.",
    "Draw: draw writes text, arrows, boxes, circles, lines, freehand paths and element highlights on a layer over the page, live; erase removes them. You cannot see that layer in frames, so trust the box each result gives, and look or list_drawings to check what is on screen.",
    "Reach beyond the page: you can search the web with web_search (for news, facts and anything current or outside this browser), think step by step with sequential_thinking, hand long problems to think_in_background (the answer comes back as a [loop think-N] note), and compute exactly with run_code.",
    "Infer: read related signals together (get_situation shows the groups and the pairs worth comparing), then say what they mean as a whole, not reading by reading.",
  ].join("\n");
}

function headline(s: ScopeDef, ss: Session) {
  const d = (ss.last?.data || {}) as Record<string, unknown>;
  const m: Record<string, unknown> = {};
  (s.metrics || []).slice(0, 4).forEach((k) => {
    const v = d[k.key];
    if (v === undefined || v === null) return;
    m[k.label] = typeof v === "number" ? `${Number(v.toFixed(k.digits ?? 2))}${k.unit ? " " + k.unit : ""}` : String(v).slice(0, 60);
  });
  if (!Object.keys(m).length) Object.entries(d).slice(0, 3).forEach(([k, v]) => { m[k] = typeof v === "object" ? "[data]" : String(v).slice(0, 60); });
  return m;
}

type Ctx = { scopes: ScopeDef[]; tools: () => ToolDef[]; find: (id: unknown) => ScopeDef | undefined; related: (s: ScopeDef) => { id: string; name: string; how: string }[] };

export async function awareCall(name: string, a: Record<string, any>, c: Ctx): Promise<ToolResult | null> {
  if (!AWARE_TOOLS.some((t) => t.name === name)) return null;
  switch (name) {
    case "get_my_history": return { ok: true, ...actionHistory({ minutes: a.minutes, failed: !!a.failed_only, tool: a.tool, limit: a.limit, loops: !!a.include_loops }) };
    case "recall_conversation": { const lines = recall({ query: a.query, limit: a.limit }); return { ok: true, count: lines.length, lines }; }
    case "start_loop": {
      const tool = String(a.tool || "");
      if (!c.tools().some((t) => t.name === tool)) return { ok: false, error: `No tool "${tool}".` };
      if (/^(start_loop|stop_loop|stop_all)$/.test(tool)) return { ok: false, error: "That tool cannot run in a loop." };
      if (listLoops().length >= 8) return { ok: false, error: "Eight loops are already running. Stop one first." };
      const until = a.until && a.until.path && a.until.op ? { path: String(a.until.path), op: a.until.op, value: a.until.value } : undefined;
      const l = startLoop({ tool, args: a.args || {}, every_s: Number(a.every_s) || 10, until, max_runs: Number(a.max_runs) || undefined, note: a.note ? String(a.note).slice(0, 120) : undefined });
      return { ok: true, id: l.id, every_s: l.every_s, message: until ? "Running. You will get a [loop] note when the condition is met." : "Running." };
    }
    case "stop_loop": {
      if (a.all) return { ok: true, stopped: stopAllLoops() };
      return stopLoop(String(a.id || "")) ? { ok: true, stopped: 1 } : { ok: false, error: `No loop "${a.id}". Call list_loops.` };
    }
    case "list_loops": return { ok: true, loops: listLoops() };
    case "get_abilities": {
      const running = allSessions().filter(isActive).map((s) => s.id);
      return { ok: true, tools: groupTools(c.tools()), groups: GROUPS, running, loops: listLoops(), seeing: seeingNow(), can_hear: "the person's voice through the mic while the voice session is on" };
    }
    case "get_situation": {
      const live = allSessions().filter(isActive);
      const ids = new Set(live.map((s) => s.id));
      const groups: Record<string, unknown[]> = {};
      live.forEach((ss) => {
        const s = c.find(ss.id);
        if (!s) return;
        (groups[s.domain] ||= []).push({
          id: s.id, name: s.name, state: ss.state, source: ss.source, records: ss.count, hz: Number((ss.hz || 0).toFixed(1)),
          age_s: ss.last ? Math.round((Date.now() - ss.last.t) / 1000) : null, now: headline(s, ss),
        });
      });
      const pairs: { a: string; b: string; how: string }[] = [];
      const seen = new Set<string>();
      live.forEach((ss) => {
        const s = c.find(ss.id);
        if (!s) return;
        c.related(s).forEach((r) => {
          if (!ids.has(r.id)) return;
          const key = [s.id, r.id].sort().join("|");
          if (seen.has(key)) return;
          seen.add(key);
          pairs.push({ a: s.id, b: r.id, how: r.how });
        });
      });
      return {
        ok: true, running: live.length,
        groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, { means: GROUPS[k], items: v }])),
        read_together: pairs.slice(0, 12),
        hint: live.length ? "Combine groups to infer: place plus motion tells travel, surroundings plus capture tells the room, device plus link tells the setup." : "Nothing is running. Offer to start something that answers the question.",
      };
    }
    case "look": {
      const s = screen();
      const st = s?.state();
      const tab = inspectorTab()?.get();
      const cap = st?.inspector ? c.find(st.inspector.id) : undefined;
      return {
        ok: true, pointer: pointerNow(), page: pageNow(), seeing: seeingNow(),
        screen: st ? { view: st.view, pane: st.pane, side_panel: cap ? { id: cap.id, name: cap.name, tab, state: getSession(cap.id).state } : null } : null,
        your_drawings: drawingCount() ? listDrawings() : [],
      };
    }
  }
  return null;
}
