import type { ToolDef } from "../agent";

// The Gemini Live setup message for the voice page. Kept apart from the page so the spoken task
// check (scripts/voice-eval.mjs) sends exactly what the page sends.

export const SYSTEM = `You are the voice of Platform Ontology, a live map of every permission, sensor and silent signal a web page can reach.
You run inside this person's own browser tab and control its capabilities with your tools: you can search them, describe them,
switch them on and off, read what they report, change their settings and run their actions.
Always use your tools to answer questions about this browser; never guess. Find ids with list_capabilities first.
Keep answers short and spoken. Before you start anything that shows a browser prompt (camera, microphone, location and similar)
or a chooser, say what it will do and wait for a yes. Never read out long raw data; summarise it.`;

/** The prompt inside the console, where the AI can also see and drive the screen. */
export const CONSOLE_SYSTEM = `${SYSTEM}
You are inside the console, the page this person is looking at. Use describe_screen to see it, and show or point_at to
bring up the view, capability or pane you are talking about, so they see it as you speak.
"Open", "show" or "go to" a capability means show its side panel (show with capability, plus tab when they name one).
Only "start", "run" or "turn on" means starting it. Do not ask before showing something; showing is always safe.`;

/** Gemini function declarations take an OpenAPI subset: one type per field. */
export function schema(s: any): any {
  if (!s || typeof s !== "object") return { type: "string" };
  const o: any = {};
  o.type = Array.isArray(s.type) ? "string" : s.type || "string";
  if (s.description) o.description = s.description;
  if (s.enum) o.enum = s.enum.map(String);
  if (o.type === "object") {
    o.properties = Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, schema(v)]));
    if (s.required?.length) o.required = s.required;
    if (!Object.keys(o.properties).length) delete o.properties;
  }
  if (o.type === "array") o.items = schema(s.items);
  return o;
}

/** The setup message. The server token locks only the model, so everything here reaches Gemini. */
export function buildSetup(model: string, tools: ToolDef[], modalities: string[] = ["AUDIO"], system: string = SYSTEM) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: modalities },
      systemInstruction: { parts: [{ text: system }] },
      tools: [{ functionDeclarations: tools.map((d) => ({ name: d.name, description: d.description, parameters: schema(d.inputSchema) })) }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Without this an audio session stops at 15 minutes.
      contextWindowCompression: { slidingWindow: {} },
    },
  };
}
