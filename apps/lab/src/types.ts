export type Plat = 'android' | 'ios' | 'web';
export type KindId = 'permission' | 'picker' | 'capability' | 'action' | 'signal' | 'tracking' | 'not-exposed';

export interface FieldDef { n: string; t: string; u: string; r: string }
export interface NativeP {
  s: string; v: string; api: number | null; pm: string; pr: string; g: string; ui: string;
  ps: string; rv: string; sp: string; as: string; nt: string;
}
export interface WebP {
  api: string; pm: string; pp: string; g: string; ui: string; sc: boolean; ug: boolean;
  ps: string; rv: string; ifr: string; st: string[]; sup: Record<string, [string, string]>;
}
export interface Item {
  id: string; n: string; k: KindId; g: string; pl: string; me: string; lc: string[]; ic: string; tg: string[];
  d: { t: string; m: string; u: string; f: FieldDef[] };
  l: { h: string; a: string; c: string[]; x: string[]; r: number; rl: string; df: string };
  s: number; fr: number; ut: number; fb: number | null; wh: string; uc: string[]; ab: string[];
  sp: 'm' | 'w';
  p: { android?: NativeP; ios?: NativeP; web?: WebP };
}
export interface Lab {
  generated: string;
  kinds: Record<string, { label: string; icon: string; description: string }>;
  groups: Record<string, { label: string; icon: string; description: string }>;
  lifecycle: Record<string, string>;
  reach: Record<string, string>;
  browsers: Record<string, string>;
  statusCodes: Record<string, string>;
  items: Item[];
}

export type Mode = 'prompt' | 'picker' | 'settings' | 'direct' | 'silent' | 'blocked';
export type NodeState = 'idle' | 'active' | 'done' | 'skip' | 'fail';
export type Phase = 'idle' | 'checking' | 'prompt' | 'picker' | 'settings' | 'granted' | 'silent' | 'denied' | 'revoked' | 'blocked';
export type Scope = 'full' | 'while' | 'once' | 'limited' | 'always' | 'deny';
export interface Opt { label: string; allow: boolean; scope: Scope }
