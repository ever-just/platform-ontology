import { getSession, isActive } from "../core/harness";

// The Access Agent's director. While a staged session is quiet, ask /api/jev (Jev, a fast judgment model) what
// the agent should do next, and pass the answer to the agent as a [director] note. Fails closed: any error or
// low confidence means the agent stays quiet.

export const PERMISSIONS = ["place.geolocation", "capture.camera", "capture.microphone", "motion.orientation"] as const;
const IDLE_S = 18;
const GAP_MS = 40e3;

export const ONBOARDING = `[onboarding] This person just pressed Start for the first time. Run a fast show and tell, about a minute:
1. Greet in one sentence: you are the Access Agent and you can see and run everything this device and browser can do.
2. Right away show two things that need no permission (for example the battery or network capability with show, then a
   show_ui card of live readings). One sentence each.
3. Then ask for location: one sentence on what it unlocks, and an ask_for_click button for place.geolocation. When it
   turns on, show it live. Then offer camera or microphone the same way.
4. End by naming two or three things they could ask you next. Keep every turn short; show more than you tell.`;

export const RESTART = "[start] The person pressed Start again. Greet in one short sentence and show one live thing right away.";

export function onboarded(): boolean {
  try { return localStorage.getItem("po.access.onboarded") === "1"; } catch { return true; }
}
export function markOnboarded() {
  try { localStorage.setItem("po.access.onboarded", "1"); } catch { /* private window */ }
}

const MOVES: Record<string, (perm: string | null) => string> = {
  demo_capability: () => "[director] The chat is quiet. Show one live capability you have not shown yet that needs no new permission, in one sentence.",
  request_permission: (p) => `[director] The chat is quiet. Ask for ${p || "one more permission"}: one sentence on what it unlocks, then an ask_for_click button.`,
  show_insight_card: () => "[director] The chat is quiet. Combine two running readings into one plain insight on a small show_ui card, and say it in one sentence.",
};

export type DirectorFeed = { lines(): string[]; shown(): string[]; turns(): number; busy(): boolean; note(text: string): void };

/** Start watching; call bump() on every line or tool step. Returns stop. */
export function startDirector(feed: DirectorFeed): { bump(): void; stop(): void } {
  let last = Date.now();
  let asked = 0;
  let off = false;
  let inflight = false;
  const tick = async () => {
    if (off || inflight || feed.busy() || document.hidden) return;
    const now = Date.now();
    if (now - last < IDLE_S * 1e3 || now - asked < GAP_MS) return;
    asked = now;
    inflight = true;
    try {
      const granted = PERMISSIONS.filter((id) => isActive(getSession(id)));
      const res = await fetch("/api/jev", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          granted, not_granted: PERMISSIONS.filter((id) => !granted.includes(id)), shown: feed.shown(),
          idle_s: Math.round((now - last) / 1e3), turns: feed.turns(), last_lines: feed.lines(),
        }),
      });
      if (!res.ok || off) return;
      const r = await res.json();
      const say = MOVES[r.move];
      if (say && Date.now() - last >= IDLE_S * 1e3) { feed.note(say(r.permission)); last = Date.now(); }
    } catch { /* stay quiet */ } finally { inflight = false; }
  };
  const iv = setInterval(tick, 5e3);
  return { bump: () => { last = Date.now(); }, stop: () => { off = true; clearInterval(iv); } };
}
