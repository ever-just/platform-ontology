import { emitNote } from "../core/agent-memory";
import type { ToolDef, ToolResult } from "./tools";

// Reach beyond the page for the voice agent:
//   web_search                Google Search in a separate, search only Live session through /api/think. Not
//                             search in this session: with it on, Live dropped about half of all sessions (1011).
//   sequential_thinking       step by step thinking in the shape of the sequential thinking MCP server
//                             (numbered thoughts, revisions, branches), kept in this tab.
//   think_in_background       a longer reasoning call on a Gemini text model through /api/think; the
//                             answer comes back later as a note, the same way loop results do, and it
//                             can keep going on its own for a few rounds when more thinking would help.
//   get_background_thinking   the state and thoughts of those jobs.
//   run_code                  a small Python program in Gemini's sandbox (the native audio model refuses
//                             code execution, so it runs server side) for computing over data.

const THOUGHT_SHAPE = {
  thought: { type: "string", description: "Your current thinking step" },
  nextThoughtNeeded: { type: "boolean", description: "Whether another thought step is needed" },
  thoughtNumber: { type: "integer", description: "Current thought number, from 1" },
  totalThoughts: { type: "integer", description: "Estimated total thoughts needed; can go up or down" },
  isRevision: { type: "boolean", description: "Whether this revises earlier thinking" },
  revisesThought: { type: "integer", description: "Which thought is being reconsidered" },
  branchFromThought: { type: "integer", description: "Branching point thought number" },
  branchId: { type: "string", description: "Branch identifier" },
  needsMoreThoughts: { type: "boolean", description: "If reaching the end but realizing more thoughts are needed" },
};

export const REACH_TOOLS: ToolDef[] = [
  {
    name: "web_search",
    description: "Search the web with Google for anything current or outside this browser: news, prices, people, places, facts, documentation. Returns a short answer and its sources. Call it at once rather than saying you will search; it takes about 15 seconds.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "What to find out, as a full question" } }, required: ["query"] },
  },
  {
    // Not "think": with Google Search on, Live closes the session (1011) when a tool has that name.
    name: "sequential_thinking",
    description: "Think a problem through step by step before you answer or act, one numbered thought per call, the way the sequential thinking tool works. You may revise an earlier thought (isRevision, revisesThought), branch (branchFromThought, branchId), and raise totalThoughts when you need more. Set nextThoughtNeeded false on the last thought. Use it for questions with several parts, plans with several tool calls, or when unsure. Thinking is silent; speak only the conclusion.",
    inputSchema: { type: "object", properties: THOUGHT_SHAPE, required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"] },
  },
  {
    name: "think_in_background",
    description: "Hand a hard or long problem to a slower, deeper thinker that works in the background while you keep talking. Returns at once with a job id; the answer arrives later as a [loop think-N] note, which you then tell the person in a sentence. With rounds above 1 it keeps thinking on its own when it finds more is needed. To carry on from an earlier job, pass continue_from with its id. Never say you are working on something in the background without calling this.",
    inputSchema: { type: "object", properties: {
      problem: { type: "string", description: "The question or problem, stated fully" },
      context: { type: "string", description: "Facts it needs: readings, tool results, what the person said" },
      rounds: { type: "integer", description: "How many rounds it may run on its own, 1 to 3. Default 1" },
      continue_from: { type: "string", description: "Id of an earlier job to continue" },
    }, required: ["problem"] },
  },
  {
    name: "get_background_thinking",
    description: "Your background thinking jobs: which are still running, and for a finished one its numbered thoughts and answer. Pass id for one job.",
    inputSchema: { type: "object", properties: { id: { type: "string" } } },
  },
  {
    name: "run_code",
    description: "Write and run a small Python program in a sandbox to compute something exactly: maths, statistics, unit conversion, sorting or summarising data you pass in. Say what to compute in task and paste the numbers or text in data. Returns the result, the program and its output. Takes a few seconds.",
    inputSchema: { type: "object", properties: {
      task: { type: "string", description: "What to compute" },
      data: { type: "string", description: "Input data as text, JSON or CSV" },
    }, required: ["task"] },
  },
];

type Thought = { thought: string; thoughtNumber: number; totalThoughts: number; nextThoughtNeeded: boolean; isRevision?: boolean; revisesThought?: number; branchFromThought?: number; branchId?: string; needsMoreThoughts?: boolean };
const history: Thought[] = [];
const branches: Record<string, Thought[]> = {};

type Step = { n: number; text: string; revises: unknown; branch: unknown };
type Job = { id: string; problem: string; context: string; state: "thinking" | "done" | "failed"; round: number; rounds: number; started: number; thoughts: Step[]; answer?: string; next_focus?: string; error?: string };
const jobs = new Map<string, Job>();
let jobSeq = 0;
const MAX_RUNNING = 3;

const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/think", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `Thinking failed (${r.status}).`);
  return out as Record<string, any>;
}

async function runJob(j: Job) {
  try {
    for (j.round = 1; j.round <= j.rounds; j.round++) {
      const before = j.answer ? `\n\nYOUR EARLIER ROUND:\n${j.answer}${j.next_focus ? `\nThink next about: ${j.next_focus}` : ""}` : "";
      const r = await post({ mode: "think", problem: j.problem, context: `${j.context}${before}` });
      j.thoughts.push(...((r.thoughts || []) as Step[]));
      j.answer = String(r.answer || "");
      j.next_focus = r.needs_more ? String(r.next_focus || "") : "";
      if (!r.needs_more) break;
    }
    j.round = Math.min(j.round, j.rounds);
    j.state = "done";
    const more = j.next_focus ? ` (more thinking could help: ${j.next_focus}; continue_from ${j.id} to go on)` : "";
    emitNote({ loop: j.id, tool: "think_in_background", kind: "done", text: `${j.answer}${more}` });
  } catch (e) {
    j.state = "failed";
    j.error = e instanceof Error ? e.message : String(e);
    emitNote({ loop: j.id, tool: "think_in_background", kind: "error", text: j.error });
  }
}

const brief = (j: Job) => ({ id: j.id, state: j.state, problem: j.problem.slice(0, 120), round: j.round, rounds: j.rounds, age_s: Math.round((Date.now() - j.started) / 1000) });

export async function reachCall(name: string, a: Record<string, any>): Promise<ToolResult | null> {
  switch (name) {
    case "sequential_thinking": {
      const t: Thought = {
        thought: String(a.thought || ""), thoughtNumber: Math.max(1, Number(a.thoughtNumber) || history.length + 1),
        totalThoughts: Math.max(1, Number(a.totalThoughts) || 1), nextThoughtNeeded: !!a.nextThoughtNeeded,
        isRevision: !!a.isRevision || undefined, revisesThought: num(a.revisesThought), branchFromThought: num(a.branchFromThought),
        branchId: a.branchId ? String(a.branchId) : undefined, needsMoreThoughts: !!a.needsMoreThoughts || undefined,
      };
      if (!t.thought) return { ok: false, error: "Send thought." };
      if (t.thoughtNumber > t.totalThoughts) t.totalThoughts = t.thoughtNumber;
      // A fresh chain starts at thought 1 on the main line; keep only the latest chain.
      if (t.thoughtNumber === 1 && !t.branchId && !t.isRevision) { history.length = 0; Object.keys(branches).forEach((k) => delete branches[k]); }
      history.push(t);
      if (history.length > 100) history.shift();
      if (t.branchFromThought && t.branchId) (branches[t.branchId] ||= []).push(t);
      return { ok: true, thoughtNumber: t.thoughtNumber, totalThoughts: t.totalThoughts, nextThoughtNeeded: t.nextThoughtNeeded, branches: Object.keys(branches), thoughtHistoryLength: history.length };
    }
    case "think_in_background": {
      const problem = String(a.problem || "").trim();
      if (!problem) return { ok: false, error: "Send problem." };
      if ([...jobs.values()].filter((j) => j.state === "thinking").length >= MAX_RUNNING) return { ok: false, error: "Three background thoughts are already running. Wait for one." };
      const prev = a.continue_from ? jobs.get(String(a.continue_from)) : undefined;
      if (a.continue_from && !prev) return { ok: false, error: `No job "${a.continue_from}". Call get_background_thinking.` };
      const j: Job = {
        id: `think-${++jobSeq}`, problem: problem.slice(0, 4000), state: "thinking", round: 0,
        rounds: Math.min(3, Math.max(1, Number(a.rounds) || 1)), started: Date.now(), thoughts: [],
        context: [String(a.context || "").slice(0, 6000), prev ? `EARLIER JOB ${prev.id} on "${prev.problem.slice(0, 200)}" concluded: ${prev.answer || prev.error || "nothing yet"}${prev.next_focus ? `. It wanted to think next about: ${prev.next_focus}` : ""}` : ""].filter(Boolean).join("\n\n"),
      };
      jobs.set(j.id, j);
      if (jobs.size > 20) jobs.delete(jobs.keys().next().value as string);
      void runJob(j);
      return { ok: true, id: j.id, message: "Thinking in the background. You will get a [loop] note with the answer; keep talking meanwhile." };
    }
    case "get_background_thinking": {
      if (a.id) {
        const j = jobs.get(String(a.id));
        return j ? { ok: true, ...brief(j), thoughts: j.thoughts.slice(-20), answer: j.answer, next_focus: j.next_focus, error: j.error } : { ok: false, error: `No job "${a.id}".` };
      }
      return { ok: true, jobs: [...jobs.values()].map(brief) };
    }
    case "web_search": {
      const query = String(a.query || "").trim();
      if (!query) return { ok: false, error: "Send query." };
      try {
        const r = await post({ mode: "search", problem: query });
        return { ok: !!r.answer, answer: r.answer, sources: r.sources, searched_for: r.queries };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    case "run_code": {
      const task = String(a.task || "").trim();
      if (!task) return { ok: false, error: "Send task." };
      try {
        const r = await post({ mode: "code", problem: task, context: a.data ? `DATA:\n${String(a.data)}` : "" });
        return { ok: r.outcome !== "OUTCOME_FAILED", result: r.answer, output: r.output, code: r.code, outcome: r.outcome };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  return null;
}
