import type { Atlas, AtlasNode, Params, ScopeDef, Session, Source } from "../core/types";
import { headline, headlineText, primaryMetric } from "../core/datatype";
import { allSessions, getSession, isActive, request, setParam, setSource, stop, stopAll, subscribe } from "../core/harness";
import { runPageAction } from "../scopes/page-controls";
import { ACTIONS, type JsonSchema } from "./actions";
import { SCREEN_TOOLS, screenCall } from "./screen-tools";
import { CONTROL_TOOLS, controlCall, findControl } from "./control-tools";
import { ACCOUNT_TOOLS, INSIGHT_TOOLS, insightCall } from "./insight-tools";
import { highlight } from "../core/screen";
import { AWARE_TOOLS, awareCall } from "./aware-tools";
import { DRAW_TOOLS, drawCall } from "./draw-tools";
import { REACH_TOOLS, reachCall } from "./reach-tools";
import { logAction, setLoopRunner } from "../core/agent-memory";
import { askClick, hasGesture } from "../core/click-asks";
import { expandQuery, plainResult } from "./plain";
import { JOB_TOOLS, jobCall } from "./job-tools";
import { PAGE_SCRIPT_TOOLS, pageScriptCall } from "./page-script-tools";
import { GENUI_TOOLS, genuiCall } from "./genui-tools";
import { setCatalogScopes } from "../genui/scopes";

const ASK_CLICK: ToolDef = {
  name: "ask_for_click",
  description: "Put a button in the chat for something only the person's own click can start: a chooser, file picker, full screen, or a page button. Use id of a capability (act start) or a page control (act press). The person clicks it and you get a note with the result.",
  inputSchema: { type: "object", properties: {
    id: { type: "string" }, act: { type: "string", enum: ["start", "press"], description: "Default start" },
    label: { type: "string", description: "Short button text, for example Pick a USB device" },
    why: { type: "string", description: "One plain sentence on why it needs a click" },
  }, required: ["id"] },
};

// The agent control layer. A small, fixed set of tools covers every capability: the capability ids,
// descriptions, related entries and actions all come from the atlas and the registered scopes, so a
// new atlas entry or demo is reachable by the agent with no new tool. Everything runs in this page,
// against this tab's harness, so the agent only ever sees and controls this one browser session.

export type ToolDef = { name: string; description: string; inputSchema: JsonSchema };
export type ToolResult = { ok: boolean; [k: string]: unknown };
export type AgentTools = { tools: ToolDef[]; call: (name: string, args?: Record<string, any>) => Promise<ToolResult>; scopes: ScopeDef[] };

export type Kind = "silent" | "ask" | "tap" | "pick";
const PICK_ID = /\.(usb|serial|hid|bluetooth|screen|contacts)$/;
const PICK_NAME = /file|folder|picker|contact/i;
/** How a capability starts: silently, with a browser prompt, needing a click, or with a chooser. */
export function kindOf(s: ScopeDef): Kind {
  if (s.reference) return "silent";
  if ((PICK_ID.test(s.id) || PICK_NAME.test(s.name)) && (s.gesture || s.permission)) return "pick";
  if (s.permission) return "ask";
  if (s.gesture) return "tap";
  return "silent";
}

/** Keep tool output small enough for a voice model: short strings, short arrays, no media. */
export function clip(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.length > 240 ? v.slice(0, 240) + "…" : v;
  if (depth > 4) return "…";
  if (Array.isArray(v)) {
    const out = v.slice(0, 12).map((x) => clip(x, depth + 1));
    if (v.length > 12) out.push(`… ${v.length - 12} more`);
    return out;
  }
  if (typeof v === "object") {
    if (typeof MediaStream !== "undefined" && v instanceof MediaStream) return "[media stream]";
    const e = Object.entries(v as Record<string, unknown>);
    const o: Record<string, unknown> = {};
    e.slice(0, 40).forEach(([k, x]) => { o[k] = clip(x, depth + 1); });
    if (e.length > 40) o["…"] = `${e.length - 40} more fields`;
    return o;
  }
  return String(v);
}

function brief(s: ScopeDef, ses: Session) {
  // reading: the latest value as its data type says to say it ("Battery: 80 %", "Charging: Yes"), never a bare rate.
  const h = headline(s, ses.last?.data as Record<string, unknown> | undefined);
  return { id: s.id, name: s.name, group: s.domain, summary: s.summary, start: kindOf(s), state: ses.state, reading: h ? headlineText(h) : undefined, type: primaryMetric(s)?.type, actions: (ACTIONS[s.id] || []).map((a) => a.name) };
}

function status(ses: Session) {
  return { state: ses.state, source: ses.source, records: ses.count, hz: Math.round(ses.hz * 10) / 10, error: ses.error || undefined, latest: ses.last ? clip(ses.last.data) : null };
}

/** Wait until a capability leaves "requesting" or produces its first record, up to ms. */
function settle(id: string, ms: number): Promise<Session> {
  return new Promise((res) => {
    const done = () => { off(); clearTimeout(t); res(getSession(id)); };
    const check = () => { const s = getSession(id); if (s.state !== "requesting" && (s.count > 0 || s.state !== "granted")) done(); };
    const off = subscribe(check);
    const t = setTimeout(done, ms);
    check();
  });
}

const DOMAINS = ["place", "motion", "surroundings", "capture", "device", "fingerprint", "link", "identity", "reach"];

/** pageControls adds list_controls, press_control and set_control. Only the local voice agent, with the
 *  person at the page, turns them on; the remote MCP relay and WebMCP never get them. account adds
 *  get_saved_readings (server readings of the signed in account), also only for the local voice agent. */
export function createAgentTools(atlas: Atlas, scopes: ScopeDef[], opts: { pageControls?: boolean; account?: boolean } = {}): AgentTools {
  const byId = new Map(scopes.map((s) => [s.id, s]));
  const byAtlas = new Map<string, ScopeDef>();
  scopes.forEach((s) => s.atlas.forEach((a) => { if (!byAtlas.has(a)) byAtlas.set(a, s); }));
  const nodes = new Map<string, AtlasNode>(atlas.nodes.map((n) => [n.i, n]));
  const find = (id: unknown) => (typeof id === "string" ? byId.get(id) || byAtlas.get(id) : undefined);
  setCatalogScopes(scopes);
  const nope = (id: unknown) => ({ ok: false, error: `No capability "${id}". Call list_capabilities to find ids.` });

  function related(s: ScopeDef) {
    const mine = new Set(s.atlas);
    const out = new Map<string, string>();
    atlas.edges.forEach(([a, b, r]) => {
      const other = mine.has(a) ? b : mine.has(b) ? a : null;
      const t = other && byAtlas.get(other);
      if (t && t.id !== s.id) out.set(t.id, r === "r" ? "requires" : "pairs with");
    });
    (s.feeds || []).forEach((f) => { if (byId.has(f)) out.set(f, "combines with"); });
    return [...out].slice(0, 20).map(([id, how]) => ({ id, name: byId.get(id)!.name, how }));
  }

  const tools: ToolDef[] = [
    {
      name: "list_capabilities",
      description: "Search the browser capabilities this page can turn on, such as camera, location, motion sensors, Bluetooth or the tab title. Returns ids to use with the other tools.",
      inputSchema: { type: "object", properties: {
        query: { type: "string", description: "Words to match in the name or summary, for example 'camera' or 'battery'" },
        group: { type: "string", enum: DOMAINS, description: "Only this group" },
        running: { type: "boolean", description: "Only capabilities that are running now" },
        limit: { type: "number", description: "Default 15, at most 60" },
      } },
    },
    {
      name: "describe_capability",
      description: "Full detail for one capability: what it reveals, how it starts, its settings, its actions and related capabilities.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    {
      name: "start_capability",
      description: "Turn a capability on in this browser. 'ask' capabilities show a browser prompt the person must allow; 'pick' ones open a chooser. Use source 'sim' for simulated data that needs no permission.",
      inputSchema: { type: "object", properties: {
        id: { type: "string" },
        source: { type: "string", enum: ["live", "sim"], description: "Default live" },
        params: { type: "object", description: "Optional settings, keys from describe_capability" },
      }, required: ["id"] },
    },
    { name: "stop_capability", description: "Turn one capability off and put back anything it changed.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    { name: "stop_all", description: "Turn every running capability off.", inputSchema: { type: "object", properties: {} } },
    { name: "get_status", description: "What is running now, with each one's latest reading.", inputSchema: { type: "object", properties: {} } },
    {
      name: "read_stream",
      description: "Read recent records from a running capability's data stream. Pass since to get only newer records.",
      inputSchema: { type: "object", properties: {
        id: { type: "string" },
        since: { type: "number", description: "Return records with seq above this" },
        limit: { type: "number", description: "Default 5, at most 50" },
      }, required: ["id"] },
    },
    {
      name: "run_action",
      description: "Run an action on a running capability, for example set_title on motion.tab-title or speak on surroundings.read-aloud. describe_capability lists the actions and their arguments.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, action: { type: "string" }, args: { type: "object" } }, required: ["id", "action"] },
    },
    {
      name: "set_param",
      description: "Change one setting of a capability. A running capability restarts to pick it up.",
      inputSchema: { type: "object", properties: { id: { type: "string" }, key: { type: "string" }, value: { type: ["string", "number", "boolean"] } }, required: ["id", "key", "value"] },
    },
    ...SCREEN_TOOLS,
    ...INSIGHT_TOOLS,
    ...(opts.account ? ACCOUNT_TOOLS : []),
    ...(opts.pageControls ? CONTROL_TOOLS : []),
    ...(opts.pageControls ? AWARE_TOOLS : []),
    ...(opts.pageControls ? DRAW_TOOLS : []),
    ...(opts.pageControls ? [...JOB_TOOLS, ASK_CLICK] : []),
    ...PAGE_SCRIPT_TOOLS,
    ...(opts.pageControls ? GENUI_TOOLS : []),
    ...(opts.pageControls ? REACH_TOOLS : []),
  ];

  // Every call is logged so the agent can read back what it did and what failed.
  async function call(name: string, a: Record<string, any> = {}, by: "agent" | "loop" = "agent"): Promise<ToolResult> {
    let r: ToolResult;
    try { r = await inner(name, a); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : String(e) }; }
    // Every result carries a plain sentence and, for changes, whether a read back confirmed it.
    r = plainResult(name, a, r);
    if (opts.pageControls) logAction(name, a, r as { ok: boolean; error?: unknown }, by);
    return r;
  }
  if (opts.pageControls) setLoopRunner((n, a) => call(n, a, "loop"));

  async function inner(name: string, a: Record<string, any> = {}): Promise<ToolResult> {
    const aw = opts.pageControls ? await awareCall(name, a, { scopes, tools: () => tools, find, related }) : null;
    if (aw) return aw;
    const dc = opts.pageControls ? await drawCall(name, a) : null;
    if (dc) return dc;
    const rc = opts.pageControls ? await reachCall(name, a) : null;
    if (rc) return rc;
    const sc = await screenCall(name, a, find);
    if (sc) return sc;
    const cc = opts.pageControls ? await controlCall(name, a) : null;
    if (cc) return cc;
    const ic = await insightCall(name, a, find, !!opts.account);
    if (ic) return ic;
    const jc = opts.pageControls ? await jobCall(name, a, { scopes, call: (n, x) => call(n, x), kindOf, getSession, isActive }) : null;
    if (jc) return jc;
    const ps = await pageScriptCall(name, a, find);
    if (ps) return ps;
    const gu = opts.pageControls ? await genuiCall(name, a) : null;
    if (gu) return gu;
    if (name === "ask_for_click") {
      const act = a.act === "press" ? "press" : "start";
      const s = act === "start" ? find(a.id) : undefined;
      if (act === "start" && !s) return nope(a.id);
      if (act === "press" && !findControl(String(a.id))) return { ok: false, error: `No control "${a.id}" on the page. Call list_controls.` };
      const ask = askClick({ id: s ? s.id : String(a.id), act, label: String(a.label || (s ? `Turn on ${s.name}` : "Click to continue")), why: String(a.why || "Your browser only allows this after your own click.") });
      return { ok: true, needs_click: true, button: ask.key, verified: false, said: "I put a button in the chat. It starts as soon as you click it." };
    }
    // Show the person which capability the agent is working on.
    const target = a.id ? find(a.id) : undefined;
    if (target) highlight(target.id);
    switch (name) {
      case "list_capabilities": {
        const q = expandQuery(String(a.query || "")).toLowerCase().split(/\s+/).filter(Boolean);
        const lim = Math.min(60, Math.max(1, Number(a.limit) || 15));
        let list = scopes.filter((s) => !s.reference || q.length > 0);
        if (a.group) list = list.filter((s) => s.domain === a.group);
        if (a.running) list = list.filter((s) => isActive(getSession(s.id)));
        if (q.length) {
          const score = (s: ScopeDef) => {
            const hay = `${s.id} ${s.name} ${s.summary} ${s.atlas.map((x) => nodes.get(x)?.n || x).join(" ")}`.toLowerCase();
            return q.reduce((n, w) => n + (hay.includes(w) ? (s.name.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
          };
          list = list.map((s) => [s, score(s)] as const).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).map(([s]) => s);
        }
        return { ok: true, total: list.length, capabilities: list.slice(0, lim).map((s) => brief(s, getSession(s.id))) };
      }
      case "describe_capability": {
        const s = find(a.id);
        if (!s) return nope(a.id);
        return {
          ok: true, ...brief(s, getSession(s.id)), call: s.call, permission: s.permission, reference: !!s.reference,
          reveals: s.reveals, modes: s.modes,
          params: (s.params || []).map((p) => ({ ...p })),
          actions: (ACTIONS[s.id] || []).map((x) => ({ name: x.name, description: x.description, args: x.input })),
          atlas: s.atlas.map((x) => { const n = nodes.get(x); return n ? { id: x, name: n.n, api: n.api, support: n.sup } : { id: x }; }),
          related: related(s),
          status: status(getSession(s.id)),
        };
      }
      case "start_capability": {
        const s = find(a.id);
        if (!s) return nope(a.id);
        if (a.source === "live" || a.source === "sim") setSource(s.id, a.source as Source);
        if (a.params && typeof a.params === "object") Object.entries(a.params as Params).forEach(([k, v]) => setParam(s.id, k, v));
        // Choosers and click only starts need the person's own click; show a button in the chat instead of failing.
        const k = kindOf(s);
        if ((k === "tap" || k === "pick") && getSession(s.id).source === "live" && !hasGesture()) {
          const ask = askClick({ id: s.id, act: "start", label: `Turn on ${s.name}`, why: k === "pick" ? "Your browser opens a chooser only after your own click." : "Your browser allows this only after your own click." });
          return { ok: false, id: s.id, needs_click: true, button: ask.key, verified: false, said: `${s.name} needs your click. I put a button for it in the chat.` };
        }
        void request(s.id);
        const ses = await settle(s.id, 2500);
        const hint = ses.state === "denied" ? "The person or the browser refused. Offer the simulated source instead."
          : ses.state === "unsupported" ? "This browser does not have it. The simulated source still works."
          : ses.state === "requesting" ? "Waiting on the person to answer a browser prompt or chooser."
          : undefined;
        // A refusal that came from having no click gets a button too, so the person can retry in one tap.
        if (!isActive(ses) && ses.source === "live" && (ses.state === "denied" || ses.state === "error") && /gesture|activation|user.?click|transient/i.test(String(ses.error || ""))) {
          const ask = askClick({ id: s.id, act: "start", label: `Turn on ${s.name}`, why: "Your browser wants your own click for this." });
          return { ok: false, id: s.id, ...status(ses), needs_click: true, button: ask.key, verified: false, said: `${s.name} needs your click. I put a button for it in the chat.` };
        }
        return { ok: isActive(ses), id: s.id, ...status(ses), hint, verified: isActive(ses) };
      }
      case "stop_capability": {
        const s = find(a.id);
        if (!s) return nope(a.id);
        stop(s.id);
        const off = !isActive(getSession(s.id));
        return { ok: off, id: s.id, state: getSession(s.id).state, verified: off, ...(off ? {} : { error: "It is still running after the stop." }) };
      }
      case "stop_all": {
        const n = allSessions().filter(isActive).length;
        stopAll();
        const left = allSessions().filter(isActive).length;
        return { ok: left === 0, stopped: n - left, still_running: left, verified: left === 0 };
      }
      case "get_status": {
        const running = allSessions().filter(isActive).map((ses) => ({ id: ses.id, name: byId.get(ses.id)?.name, ...status(ses) }));
        return { ok: true, running, count: running.length };
      }
      case "read_stream": {
        const s = find(a.id);
        if (!s) return nope(a.id);
        const ses = getSession(s.id);
        const lim = Math.min(50, Math.max(1, Number(a.limit) || 5));
        const since = Number(a.since) || 0;
        const recs = ses.records.filter((r) => r.seq > since).slice(-lim);
        return { ok: true, id: s.id, state: ses.state, total: ses.count, records: recs.map((r) => ({ seq: r.seq, t: r.t, data: clip(r.data) })) };
      }
      case "run_action": {
        const s = find(a.id);
        if (!s) return nope(a.id);
        const act = (ACTIONS[s.id] || []).find((x) => x.name === a.action);
        if (!act) return { ok: false, error: `No action "${a.action}" on ${s.id}. Actions: ${(ACTIONS[s.id] || []).map((x) => x.name).join(", ") || "none"}.` };
        let ses = getSession(s.id);
        if (!isActive(ses)) { void request(s.id); ses = await settle(s.id, 2500); }
        const before = getSession(s.id).count;
        if (!runPageAction(s.id, act.patch(a.args || {}))) return { ok: false, error: `${s.name} is not running (${ses.state}).` };
        const after = await settle(s.id, 400);
        // Confirmed when the capability reported a new reading after the action.
        const moved = getSession(s.id).count > before;
        return { ok: true, id: s.id, action: act.name, latest: after.last ? clip(after.last.data) : null, verified: moved, ...(moved ? {} : { hint: "No new reading came back yet. Read the stream before saying it worked." }) };
      }
      case "set_param": {
        const s = find(a.id);
        if (!s) return nope(a.id);
        const p = (s.params || []).find((x) => x.key === a.key);
        if (!p) return { ok: false, error: `No setting "${a.key}". Settings: ${(s.params || []).map((x) => x.key).join(", ") || "none"}.` };
        const v = p.type === "number" ? Math.min(p.max, Math.max(p.min, Number(a.value))) : p.type === "bool" ? a.value === true || a.value === "true" : String(a.value);
        if (p.type === "select" && !p.options.includes(v as string)) return { ok: false, error: `Choose one of ${p.options.join(", ")}.` };
        setParam(s.id, p.key, v);
        if (isActive(getSession(s.id))) { void request(s.id); await settle(s.id, 1500); }
        const now = getSession(s.id).params?.[p.key];
        return { ok: true, id: s.id, key: p.key, value: v, verified: now === v };
      }
    }
    return { ok: false, error: `Unknown tool ${name}` };
  }

  return { tools, call, scopes };
}
