import type { ComponentType } from "react";

export type DomainId = "place" | "motion" | "surroundings" | "capture" | "device" | "fingerprint" | "link" | "identity" | "reach";

export type Domain = { id: DomainId; name: string; short: string; blurb: string; count: number };

/** One atlas attribute, compacted (see scripts/gen-console-data.mjs). */
export type AtlasNode = {
  i: string; n: string; k: string; d: DomainId; g: string; sg: string; p: string; m: string; sup: string;
  api?: string; perm?: string; gr?: string; ui?: string; ps?: string; rv?: string; ug?: 1; dm?: string; du?: string;
  f?: { n: string; t: string; u: string }[]; fb?: number; sv?: number;
};

export type Atlas = { built: string; browsers: string[]; domains: Domain[]; nodes: AtlasNode[]; edges: [string, string, "r" | "p"][] };

export type Source = "live" | "sim";

export type SessionState = "idle" | "requesting" | "granted" | "streaming" | "denied" | "unsupported" | "error" | "stopped";

/** One normalized record. Every scope emits the same envelope; only `data` differs. */
export type Rec<D = Record<string, unknown>> = { seq: number; t: number; data: D };

export type Param =
  | { key: string; label: string; type: "bool"; value: boolean; hint?: string }
  | { key: string; label: string; type: "number"; value: number; min: number; max: number; step?: number; unit?: string; hint?: string }
  | { key: string; label: string; type: "select"; value: string; options: string[]; hint?: string };

export type Params = Record<string, boolean | number | string>;

/** Passed to a scope adapter. `emit` pushes a record into the unified stream. */
export type Ctx = {
  params: Params;
  emit: (data: Record<string, unknown>) => void;
  setMedia: (m: MediaStream | null) => void;
  log: (msg: string) => void;
  /** Mark that the browser granted access (moves state from requesting to granted). */
  granted: () => void;
};

export type Stop = () => void;

/** How a capability can be used. detect: the API exists or one value is read; stream: a continuous
 * feed; create: it produces something new, such as a photo, a recording or a file. */
export type AccessMode = "detect" | "stream" | "create";

/** How much a capability reveals. 1: insightful alone; 2: joined with related data in its group;
 * 3: joined across groups, the highest insight, usually with actions. */
export type DataLayer = 1 | 2 | 3;

export type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type InstrumentProps = { scope: ScopeDef; session: Session };

/** One endpoint of the unified API, e.g. `surroundings.bluetooth`. */
export type ScopeDef = {
  id: string;
  name: string;
  domain: DomainId;
  /** Atlas ids this scope exposes. */
  atlas: string[];
  /** One plain sentence: what you get when you turn it on. */
  summary: string;
  /** The JS call the harness makes, shown in the request panel. */
  call: string;
  /** Permissions API name, if any, for the state readout. */
  permission?: string;
  /** Needs a click to start (the console always starts from a click anyway). */
  gesture?: boolean;
  /** No prompt: data is collected silently. */
  passive?: boolean;
  /** Icon for this capability. Falls back to its group icon. */
  icon?: IconType;
  /** Access modes this capability offers, each with one plain sentence. */
  modes?: Partial<Record<AccessMode, string>>;
  /** Data layer, see DataLayer. */
  layer?: DataLayer;
  /** What this data lets a site work out. */
  reveals: string[];
  /** Other scope ids this one combines with to reveal more. */
  feeds?: string[];
  /** Headline metrics shown in the telemetry strip and overlay. Keys into the latest record's data. */
  metrics?: { key: string; label: string; unit?: string; digits?: number }[];
  params?: Param[];
  /** Real browser adapter. Throw a DOMException on refusal. Return a stop function. */
  live: (ctx: Ctx) => Promise<Stop | void>;
  /** Simulated adapter so the instrument renders on any device. */
  sim: (ctx: Ctx) => Stop;
  Instrument: ComponentType<InstrumentProps>;
};

export type Session = {
  id: string;
  state: SessionState;
  source: Source;
  params: Params;
  records: Rec[];
  last: Rec | null;
  count: number;
  startedAt: number;
  firstAt: number;
  hz: number;
  media: MediaStream | null;
  error: string;
  logs: { t: number; msg: string; level: "info" | "ok" | "warn" | "err" }[];
  permState: string;
  version: number;
};
