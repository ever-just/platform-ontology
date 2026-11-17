// Actions an agent can run on a capability while it is running. Each one maps to the exact patch
// the capability's own buttons send, so the agent and the person use one code path.

export type JsonSchema = { type: string; properties?: Record<string, unknown>; required?: string[]; enum?: unknown[]; description?: string; [k: string]: unknown };

export type ActionDef = {
  name: string;
  description: string;
  input: JsonSchema;
  /** Turn tool arguments into the patch the running adapter applies. */
  patch: (a: Record<string, any>) => Record<string, unknown>;
};

const obj = (properties: Record<string, unknown> = {}, required: string[] = []): JsonSchema => ({ type: "object", properties, required });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const num = (description: string, minimum?: number, maximum?: number) => ({ type: "number", description, minimum, maximum });
const reset: ActionDef = { name: "reset", description: "Put the original value back.", input: obj(), patch: () => ({ reset: true }) };

export const ACTIONS: Record<string, ActionDef[]> = {
  "motion.tab-title": [
    { name: "set_title", description: "Change this tab's title.", input: obj({ title: str("New title") }, ["title"]), patch: (a) => ({ title: String(a.title) }) },
    { name: "set_icon", description: "Swap the tab icon.", input: obj({ icon: str("original, badge (a count), or one emoji", { enum: ["original", "badge", "🧪", "🔥", "⭐", "💬"] }) }, ["icon"]), patch: (a) => ({ icon: a.icon }) },
    { name: "set_badge", description: "Show an unread count on the icon and app badge (0 clears it).", input: obj({ count: num("Unread count", 0, 99) }, ["count"]), patch: (a) => ({ badge: Number(a.count) || 0 }) },
    { name: "set_flash", description: "Make the title flash when the tab is hidden.", input: obj({ on: { type: "boolean" } }, ["on"]), patch: (a) => ({ flash: !!a.on }) },
    { name: "reset", description: "Put the original title and icon back.", input: obj(), patch: () => ({ reset: true, badge: 0 }) },
  ],
  "device.theme-color": [
    { name: "set_color", description: "Paint the browser toolbar a color.", input: obj({ color: str("CSS color, for example #3b5bdb") }, ["color"]), patch: (a) => ({ color: String(a.color) }) },
    reset,
  ],
  "reach.address-bar": [
    { name: "replace_query", description: "Rewrite the query string in the address bar without loading a page.", input: obj({ query: str("Query, for example a=1&b=2") }, ["query"]), patch: (a) => ({ op: "replace", query: String(a.query || "") }) },
    { name: "push_query", description: "Add a back button entry with a new query string.", input: obj({ query: str("Query, for example step=2") }, ["query"]), patch: (a) => ({ op: "push", query: String(a.query || "") }) },
    reset,
  ],
  "reach.fullscreen": [
    { name: "enter", description: "Go fullscreen. Browsers only allow this within a few seconds of a click.", input: obj(), patch: () => ({ op: "enter" }) },
    { name: "exit", description: "Leave fullscreen.", input: obj(), patch: () => ({ op: "exit" }) },
  ],
  "surroundings.read-aloud": [
    {
      name: "speak", description: "Read text aloud with a device voice.",
      input: obj({ text: str("Up to 400 characters"), voice: str("Voice name from the stream's list, optional"), rate: num("0.5 to 2", 0.5, 2), pitch: num("0 to 2", 0, 2) }, ["text"]),
      patch: (a) => ({ op: "speak", text: String(a.text || ""), voice: a.voice, rate: a.rate ?? 1, pitch: a.pitch ?? 1 }),
    },
    { name: "cancel", description: "Stop speaking.", input: obj(), patch: () => ({ op: "cancel" }) },
  ],
  "surroundings.tone": [
    {
      name: "play", description: "Play a tone. Needs a recent click in some browsers.",
      input: obj({ freq: num("Pitch in Hz", 55, 1760), gain: num("Volume 0 to 0.5", 0, 0.5), wave: str("Wave shape", { enum: ["sine", "square", "sawtooth", "triangle"] }) }),
      patch: (a) => ({ playing: true, ...(a.freq != null && { freq: Number(a.freq) }), ...(a.gain != null && { gain: Math.min(0.5, Number(a.gain)) }), ...(a.wave && { wave: a.wave }) }),
    },
    { name: "stop_tone", description: "Stop the tone.", input: obj(), patch: () => ({ playing: false }) },
  ],
  "reach.leave-warning": [
    { name: "arm", description: "Turn the 'Leave site?' warning on or off.", input: obj({ on: { type: "boolean" } }, ["on"]), patch: (a) => ({ armed: !!a.on }) },
  ],
  "reach.cookies": [
    { name: "set_cookie", description: "Set a cookie for one hour.", input: obj({ name: str("Letters, digits, dash"), value: str("Up to 200 characters") }, ["name", "value"]), patch: (a) => ({ op: "set", name: String(a.name), value: String(a.value) }) },
    { name: "delete_cookie", description: "Delete a cookie this session set.", input: obj({ name: str("Cookie name") }, ["name"]), patch: (a) => ({ op: "delete", name: String(a.name) }) },
  ],
  "reach.download": [
    {
      name: "save_file", description: "Save a small text file to the Downloads folder.",
      input: obj({ name: str("File name without extension"), kind: str("File type", { enum: ["txt", "csv", "json"] }), text: str("Contents") }, ["text"]),
      patch: (a) => ({ name: a.name || "note", kind: a.kind || "txt", text: String(a.text || "") }),
    },
  ],
  "identity.window-name": [
    { name: "set_value", description: "Write window.name, which survives reloads in this tab.", input: obj({ value: str("Value") }, ["value"]), patch: (a) => ({ value: String(a.value) }) },
    reset,
  ],
};
