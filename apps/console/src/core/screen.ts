// The console's screen as shared state, so the voice agent can see and drive what the person sees.
// App registers the live handles; the agent tools read and call them. On pages without the console
// (the standalone voice page) nothing is registered and the screen tools say so.

export type ScreenView = { id: string; label: string; value?: string };
export type ScreenState = {
  pane: "overview" | "caps";
  view: ScreenView | null;
  views: ScreenView[];
  inspector: { id: string; name: string; tab?: InspectorTab } | null;
  look: string;
  wide: boolean;
};
export type ScreenApi = {
  state(): ScreenState;
  setPane(p: "overview" | "caps"): void;
  setView(id: string): boolean;
  select(id: string): boolean;
  close(): void;
};

let api: ScreenApi | null = null;
export function registerScreen(a: ScreenApi) {
  api = a;
  return () => { if (api === a) api = null; };
}
export const screen = () => api;

// The open side panel's tab (Live, Record, About, Log). The Inspector registers its setter while mounted.
export const INSPECTOR_TABS = ["live", "record", "about", "log"] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];
let tabApi: { get(): InspectorTab; set(t: InspectorTab): void } | null = null;
export function registerInspectorTab(a: { get(): InspectorTab; set(t: InspectorTab): void }) {
  tabApi = a;
  return () => { if (tabApi === a) tabApi = null; };
}
export const inspectorTab = () => tabApi;

/** Wait for React to commit and the browser to paint, so reads and highlights see the new screen. */
export const settle = () => new Promise<void>((r) => {
  if (typeof requestAnimationFrame === "undefined") return r();
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => requestAnimationFrame(go));
  setTimeout(go, 120); // hidden tabs pause animation frames
});

const sel = (kind: "cap" | "view" | "tab", id: string) => document.querySelector<HTMLElement>(`[data-${kind}="${CSS.escape(id)}"]`);

/** Briefly ring a capability row or a view tab so the person sees where the AI is looking. */
export function highlight(id: string, kind: "cap" | "view" | "tab" = "cap", ms = 2600) {
  if (typeof document === "undefined") return false;
  const el = sel(kind, id);
  if (!el) return false;
  el.classList.remove("ai-look");
  void el.offsetWidth; // restart the animation
  el.classList.add("ai-look");
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  window.setTimeout(() => el.classList.remove("ai-look"), ms);
  return true;
}
