// Buttons the AI puts in the chat when something needs the person's own click. Browsers only allow
// some things (choosers, file pickers, full screen, some prompts) right after a real click, so the
// AI cannot start them itself. It posts an ask here; the chat shows a button with the capability's
// icon and a plain label; the click runs the start inside that click, so the browser allows it.

export type ClickAsk = {
  key: string;
  /** Capability id to start, or a page control to press. */
  id: string;
  label: string;
  why: string;
  /** What the button does: start a capability, or press a control on the page. */
  act: "start" | "press";
  at: number;
  done?: "clicked" | "dismissed";
};

const asks = new Map<string, ClickAsk>();
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => { try { f(); } catch { /* a listener never breaks the agent */ } });
let n = 0;

export function onClickAsks(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export const openAsks = () => [...asks.values()].filter((a) => !a.done);
export const getAsk = (key: string) => asks.get(key);

/** Post a button. An open ask for the same id is reused, so repeats never stack up. */
export function askClick(a: Omit<ClickAsk, "key" | "at">): ClickAsk {
  const same = openAsks().find((x) => x.id === a.id && x.act === a.act);
  if (same) return same;
  const ask: ClickAsk = { ...a, key: `click${++n}`, at: Date.now() };
  asks.set(ask.key, ask);
  ping();
  return ask;
}

export function settleAsk(key: string, done: "clicked" | "dismissed") {
  const a = asks.get(key);
  if (!a || a.done) return;
  a.done = done;
  ping();
}

/** True when the page just had a real click or key press, so a gated start can run now. */
export function hasGesture() {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return !!ua?.isActive;
}
