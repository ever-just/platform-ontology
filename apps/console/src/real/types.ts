export type Field = { name: string; value: string | number | boolean | null; unit?: string };
export type RealResult = { ok: boolean; fields: Field[]; media?: MediaStream; note?: string; error?: string; raw?: unknown };
export type RealHandler = { id: string; label: string; needsGesture: boolean; run: () => Promise<RealResult>; stop?: () => void };
export type PassiveSignal = { id: string; label: string; value: string; detail?: string; group: string };
