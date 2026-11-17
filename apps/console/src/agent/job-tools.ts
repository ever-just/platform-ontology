// Long running work for the AI: "turn everything on" and step lists that run in the background.
// A job returns its id at once, keeps going while the conversation continues, reports progress as
// quiet notes, and speaks only its final summary. Steps that need the person's click become buttons
// in the chat instead of failing.

import type { ScopeDef, Session } from "../core/types";
import type { Kind, ToolDef, ToolResult } from "./tools";
import { emitNote } from "../core/agent-memory";
import { askClick } from "../core/click-asks";
import { plainState } from "./plain";

type Ctx = {
  scopes: ScopeDef[];
  call: (name: string, a: Record<string, any>) => Promise<ToolResult>;
  kindOf: (s: ScopeDef) => Kind;
  getSession: (id: string) => Session;
  isActive: (s: Session) => boolean;
};

type Job = { id: string; title: string; total: number; done: number; ok: string[]; failed: { what: string; why: string }[]; clicks: string[]; state: "running" | "done" | "stopped"; started: number };
const jobs = new Map<string, Job>();
let n = 0;

export const JOB_TOOLS: ToolDef[] = [
  {
    name: "turn_on_everything",
    description: "Turn on every capability, or every one in a group, one after another in the background. Use when the person says turn everything on, run everything, give it full access, turn on all permissions, or turn on all the sensors (or any other group) with live or simulated data. Call it directly with the group name; no lookup is needed first. Silent ones start first, then ones with a browser prompt (one at a time, waiting for each answer), then ones that need the person's click, which appear as buttons in the chat. Returns a job id at once; the summary arrives as a note when it ends.",
    inputSchema: { type: "object", properties: {
      group: { type: "string", description: "Only this group, for example sensors or media" },
      source: { type: "string", enum: ["live", "sim"], description: "Default live. sim needs no permission and no clicks." },
      include_prompts: { type: "boolean", description: "Default true. false skips anything that shows a browser prompt." },
    } },
  },
  {
    name: "run_job",
    description: "Run a list of tool calls in the background, in order, and report when done. Use for long or many step requests so the conversation is not blocked. Each step is {tool, args}.",
    inputSchema: { type: "object", properties: {
      title: { type: "string", description: "Plain name for the job, said back to the person" },
      steps: { type: "array", items: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool"] } },
      stop_on_fail: { type: "boolean", description: "Default false" },
    }, required: ["title", "steps"] },
  },
  { name: "list_jobs", description: "Background jobs with their progress: what worked, what failed and why, and what waits on a click.", inputSchema: { type: "object", properties: {} } },
  { name: "stop_job", description: "Stop a background job after its current step.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
];

const view = (j: Job) => ({ id: j.id, title: j.title, state: j.state, progress: `${j.done} of ${j.total}`, worked: j.ok.length, failed: j.failed, waiting_on_click: j.clicks });

function summary(j: Job) {
  const parts = [`${j.title}: ${j.ok.length} of ${j.total} turned on and confirmed`];
  if (j.failed.length) parts.push(`${j.failed.length} did not work (${j.failed.slice(0, 6).map((f) => `${f.what}: ${f.why}`).join("; ")})`);
  if (j.clicks.length) parts.push(`${j.clicks.length} need the person's click, and their buttons are in the chat (${j.clicks.slice(0, 8).join(", ")})`);
  if (j.state === "stopped") parts.push("stopped early");
  return parts.join(". ") + ".";
}

function finish(j: Job) {
  if (j.state === "running") j.state = "done";
  emitNote({ loop: j.id, tool: "job", kind: "done", text: `${summary(j)} Tell the person in one or two plain sentences.` });
}

const progress = (j: Job, text: string) => emitNote({ loop: j.id, tool: "job", kind: "change", text, quiet: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startOne(ctx: Ctx, j: Job, s: ScopeDef, source: "live" | "sim") {
  const k = ctx.kindOf(s);
  if (source === "live" && (k === "tap" || k === "pick")) {
    askClick({ id: s.id, label: `Turn on ${s.name}`, why: "Your browser only allows this after your own click.", act: "start" });
    j.clicks.push(s.name);
    return;
  }
  const r = await ctx.call("start_capability", { id: s.id, source });
  if (r.needs_click) { j.clicks.push(s.name); return; }
  // An ask capability waits on the person; give them up to 30 seconds per prompt.
  let ses = ctx.getSession(s.id);
  for (let t = 0; ses.state === "requesting" && t < 30; t++) { await sleep(1000); ses = ctx.getSession(s.id); }
  if (ctx.isActive(ses)) j.ok.push(s.name);
  else j.failed.push({ what: s.name, why: ses.error ? String(ses.error).slice(0, 80) : plainState(ses.state) });
}

export async function jobCall(name: string, a: Record<string, any>, ctx: Ctx): Promise<ToolResult | null> {
  switch (name) {
    case "turn_on_everything": {
      const source = a.source === "sim" ? "sim" : "live";
      let list = ctx.scopes.filter((s) => !s.reference && !ctx.isActive(ctx.getSession(s.id)));
      if (a.group) list = list.filter((s) => s.domain === a.group || s.id.startsWith(`${a.group}.`));
      if (a.include_prompts === false && source === "live") list = list.filter((s) => ctx.kindOf(s) === "silent");
      const order: Record<Kind, number> = { silent: 0, ask: 1, tap: 2, pick: 3 };
      list.sort((x, y) => order[ctx.kindOf(x)] - order[ctx.kindOf(y)]);
      if (!list.length) return { ok: true, verified: true, said: "Everything there is already on." };
      const j: Job = { id: `job${++n}`, title: a.group ? `Turning on ${a.group}` : "Turning everything on", total: list.length, done: 0, ok: [], failed: [], clicks: [], state: "running", started: Date.now() };
      jobs.set(j.id, j);
      void (async () => {
        for (const s of list) {
          if (j.state !== "running") break;
          try { await startOne(ctx, j, s, source); } catch (e) { j.failed.push({ what: s.name, why: e instanceof Error ? e.message : String(e) }); }
          j.done++;
          if (j.done % 5 === 0) progress(j, `${j.done} of ${j.total} done, ${j.ok.length} on`);
        }
        finish(j);
      })();
      const counts = list.reduce((m, s) => { const k = ctx.kindOf(s); m[k] = (m[k] || 0) + 1; return m; }, {} as Record<string, number>);
      return { ok: true, job: j.id, total: list.length, by_kind: counts, verified: undefined,
        said: `Started turning on ${list.length} things in the background${counts.ask && source === "live" ? `; ${counts.ask} will show a browser prompt to allow` : ""}${(counts.tap || 0) + (counts.pick || 0) && source === "live" ? `; ${(counts.tap || 0) + (counts.pick || 0)} need your click and will show as buttons in the chat` : ""}.` };
    }
    case "run_job": {
      const steps = Array.isArray(a.steps) ? (a.steps as { tool: string; args?: Record<string, any> }[]).filter((x) => x && typeof x.tool === "string") : [];
      if (!steps.length) return { ok: false, error: "Give at least one step." };
      if (steps.some((x) => ["run_job", "turn_on_everything"].includes(x.tool))) return { ok: false, error: "A job cannot start another job." };
      const j: Job = { id: `job${++n}`, title: String(a.title || "Background job"), total: steps.length, done: 0, ok: [], failed: [], clicks: [], state: "running", started: Date.now() };
      jobs.set(j.id, j);
      void (async () => {
        for (const st of steps) {
          if (j.state !== "running") break;
          const r = await ctx.call(st.tool, st.args || {});
          const what = String(st.args?.id || st.tool);
          if (r.needs_click) j.clicks.push(what);
          else if (r.ok && r.verified !== false) j.ok.push(what);
          else j.failed.push({ what, why: String(r.error || (r.verified === false ? "could not confirm it took effect" : "failed")).slice(0, 100) });
          j.done++;
          progress(j, `${j.title}: step ${j.done} of ${j.total} ${r.ok ? "worked" : "failed"}`);
          if (!r.ok && a.stop_on_fail) { j.state = "stopped"; break; }
        }
        finish(j);
      })();
      return { ok: true, job: j.id, total: steps.length, said: `Started ${j.title} in the background, ${steps.length} steps.` };
    }
    case "list_jobs":
      return { ok: true, jobs: [...jobs.values()].slice(-10).map(view) };
    case "stop_job": {
      const j = jobs.get(String(a.id));
      if (!j) return { ok: false, error: `No job ${a.id}. Call list_jobs.` };
      if (j.state === "running") j.state = "stopped";
      return { ok: true, verified: true, ...view(j), said: `Stopping ${j.title}.` };
    }
  }
  return null;
}
