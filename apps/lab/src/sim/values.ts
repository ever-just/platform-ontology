import type { FieldDef, Item, Plat } from '../types';

export type Viz = 'map' | 'motion' | 'audio' | 'camera' | 'ids' | 'meter' | 'table';

export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hex(seed: string, len = 16): string {
  const r = rng(strHash(seed));
  let s = '';
  for (let i = 0; i < len; i++) s += Math.floor(r() * 16).toString(16);
  return s;
}

export function isLive(item: Item): boolean {
  const u = item.d.u || '';
  return /\bhz\b|continuous|live|real.?time|per frame|streaming|every second|per second/i.test(u) || item.d.t === 'stream';
}

export function hzOf(item: Item): number {
  const m = (item.d.u || '').match(/(\d+)\s*hz/i);
  return m ? Math.min(60, Number(m[1])) : 10;
}

export function vizOf(item: Item): Viz {
  const names = item.d.f.map((f) => f.n.toLowerCase());
  const id = item.id.toLowerCase();
  const has = (...k: string[]) => k.some((x) => names.includes(x));
  if (has('latitude', 'lat') && has('longitude', 'lng', 'lon')) return 'map';
  if (/geolocation|location\.precise|location\.approximate|location\.background|location-button|geolocation-element/.test(id)) return 'map';
  if (/accelerometer|gyroscope|magnetometer|device-orientation|motion-sensors|motion-activity|linear-accel|gravity|rotation-vector|orientation/.test(id) || has('alpha', 'beta', 'gamma') || (has('x') && has('y') && has('z'))) return 'motion';
  if (/microphone|audio-record|speech|media-recorder|voice|sound|audio/.test(id) && !/audio-session|audio-output|speaker|audio-context/.test(id)) return 'audio';
  if (/\.camera\.camera|display-capture|screen-cap|usermedia|camera-ptz|camera\./.test(id) || /mob\.camera|mob\.cam\./.test(id) || /\bcamera\b/.test(item.n.toLowerCase()) && item.k === 'permission') return 'camera';
  if (item.d.t === 'hash' || names.some((n) => /(^id$|uuid|token|hash|fingerprint|gaid|idfa|idfv|advertis|identifier|serial|imei)/.test(n))) return 'ids';
  if (item.d.f.length === 1 && /float|integer|number/.test(item.d.f[0].t) && parseRange(item.d.f[0].r)) return 'meter';
  return 'table';
}

export function parseRange(r: string): [number, number] | null {
  const m = r.match(/(-?\d+(?:\.\d+)?)\s*(?:to|\.\.|–)\s*(-?\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const a = Number(m[1]); const b = Number(m[2]);
  if (!isFinite(a) || !isFinite(b) || a === b) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

function enumChoices(r: string): string[] | null {
  if (!r || r.length > 90) return null;
  const parts = r.split(/,|\bor\b|\|/).map((s) => s.replace(/[()]/g, '').trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 8 && parts.every((p) => p.length <= 24 && !/\d+\s*to\s*\d+/.test(p))) return parts;
  return null;
}

export interface Ctx { item: Item; plat: Plat; t: number }
const CITY = { lat: 44.9778, lon: -93.265 };

function osWord(plat: Plat) { return plat === 'ios' ? 'iOS 19.1' : plat === 'android' ? 'Android 16' : 'macOS 15'; }

/** Number for a numeric field at time t (seconds). */
export function numberFor(f: FieldDef, ctx: Ctx, idx: number): number {
  const n = f.n.toLowerCase();
  const id = ctx.item.id;
  const t = ctx.t;
  const ph = (strHash(id + f.n) % 628) / 100;
  if (n === 'latitude' || n === 'lat') return CITY.lat + Math.sin(t * 0.25 + ph) * 0.0009 + (/approx/.test(id) ? 0.01 : 0);
  if (n === 'longitude' || n === 'lng' || n === 'lon') return CITY.lon + Math.cos(t * 0.21 + ph) * 0.0011 + (/approx/.test(id) ? -0.008 : 0);
  if (n === 'accuracy') return /approx|coarse/.test(id) ? 1800 + Math.sin(t) * 40 : 6 + Math.abs(Math.sin(t * 0.7)) * 4;
  if (n === 'altitude') return 256 + Math.sin(t * 0.3) * 1.2;
  if (n === 'speed') return Math.abs(Math.sin(t * 0.2 + ph)) * 1.6;
  if (n === 'heading') return ((t * 18 + ph * 40) % 360);
  if (/accel|motion/.test(id) || /accel/.test(ctx.item.n.toLowerCase())) {
    if (n === 'x') return Math.sin(t * 2.1) * 1.4;
    if (n === 'y') return Math.cos(t * 1.7) * 1.1;
    if (n === 'z') return 9.81 + Math.sin(t * 3.3) * 0.5;
  }
  if (/magnet/.test(id)) { if (n === 'x') return 22 + Math.sin(t * 0.9) * 3; if (n === 'y') return -8 + Math.cos(t * 0.8) * 3; if (n === 'z') return 41 + Math.sin(t * 0.5) * 2; }
  if (n === 'x') return Math.sin(t * 2.3 + ph) * 0.8;
  if (n === 'y') return Math.cos(t * 1.9 + ph) * 0.7;
  if (n === 'z') return Math.sin(t * 1.3 + ph) * 0.6;
  if (n === 'alpha') return (t * 22) % 360;
  if (n === 'beta') return Math.sin(t * 0.9) * 40;
  if (n === 'gamma') return Math.cos(t * 0.7) * 25;
  const r = parseRange(f.r);
  if (r) {
    const [a, b] = r;
    const live = isLive(ctx.item);
    const mid = (a + b) / 2;
    const amp = (b - a) / (live ? 3 : 2.4);
    const v = mid + Math.sin(t * (0.6 + idx * 0.37) + ph) * amp * (live ? 1 : 0.55);
    if (/int|count|step/.test(f.t) || /steps|count/.test(f.n)) return Math.round(v);
    return v;
  }
  if (/level|fraction|ratio|volume/.test(n)) return 0.72 + Math.sin(t * 0.3) * 0.05;
  return Math.round(40 + Math.sin(t * 0.8 + ph) * 30);
}

function fmtNum(v: number, f: FieldDef): string {
  const n = f.n.toLowerCase();
  if (n === 'latitude' || n === 'longitude' || n === 'lat' || n === 'lng' || n === 'lon') return v.toFixed(5);
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
  if (/int|count|step/.test(f.t) || Number.isInteger(v)) return String(Math.round(v));
  if (Math.abs(v) < 1) return v.toFixed(3);
  return v.toFixed(2);
}

export function textFor(f: FieldDef, ctx: Ctx): string {
  const n = f.n.toLowerCase();
  const { item, plat } = ctx;
  const seed = item.id + f.n;
  if (/user.?agent/.test(n)) return plat === 'web' ? navigator.userAgent.slice(0, 48) + '...' : 'Atlas/4.2';
  if (/lang/.test(n)) return 'en-US';
  if (/time.?zone|tz/.test(n)) return 'America/Chicago';
  if (/country|region/.test(n) && !/code/.test(n)) return 'US';
  if (/city/.test(n)) return 'Minneapolis';
  if (/email/.test(n)) return 'sam@example.com';
  if (/phone|msisdn/.test(n)) return '+1 612 555 0142';
  if (/url|origin|href|domain|host/.test(n)) return 'https://platformontology.lol';
  if (/model/.test(n)) return plat === 'ios' ? 'iPhone17,1' : plat === 'android' ? 'Pixel 9 Pro' : 'MacBookPro18,3';
  if (/os|version|build/.test(n)) return osWord(plat);
  if (/name|label/.test(n)) return /device|host/.test(n) ? "Sam's phone" : 'Sam Rivera';
  if (/color|colour/.test(n)) return '#2F5BFF';
  if (/id$|^id|uuid|token|hash|fingerprint|identifier|serial|key/.test(n)) return hex(seed, 8) + '-' + hex(seed + 'b', 4) + '-' + hex(seed + 'c', 12);
  return 'sample-' + hex(seed, 6);
}

export function valueFor(f: FieldDef, ctx: Ctx, idx = 0): string {
  const t = f.t.toLowerCase();
  const r = rng(strHash(ctx.item.id + f.n));
  if (/bool/.test(t)) {
    const live = isLive(ctx.item);
    return live ? (Math.sin(ctx.t * 0.3 + idx) > 0 ? 'true' : 'false') : (r() > 0.4 ? 'true' : 'false');
  }
  if (/hash/.test(t)) return hex(ctx.item.id + f.n, 12) + '...';
  if (/datetime|date|time$/.test(t)) return new Date(ctx.t * 1000 + 1.7e12).toISOString().slice(0, 19) + 'Z';
  if (/enum|option/.test(t)) {
    const c = enumChoices(f.r);
    if (c) return c[Math.floor(r() * c.length)];
    return 'value';
  }
  if (/float|int|number|days/.test(t) && !/list|array|null/.test(t.replace('float or null', ''))) return fmtNum(numberFor(f, ctx, idx), f);
  if (/float or null/.test(t)) return fmtNum(numberFor(f, ctx, idx), f);
  if (/list of \d+ floats/.test(t)) return `[${[0, 1, 2, 3].map((i) => numberFor({ ...f, n: 'q' + i, r: '-1 to 1' }, ctx, i).toFixed(2)).join(', ')}]`;
  if (/float pair/.test(t)) return `${numberFor(f, ctx, 0).toFixed(2)}, ${numberFor(f, ctx, 1).toFixed(2)}`;
  if (/binary/.test(t)) return `<${(2 + r() * 40).toFixed(1)} KB binary>`;
  if (/stream/.test(t)) return 'live stream';
  if (/list|array/.test(t)) return `${2 + Math.floor(r() * 5)} items`;
  if (/object|map|tree|mixed|claim|rule/.test(t)) {
    const parts = f.r.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return parts.length ? `{ ${parts.join(', ')} }` : '{ ... }';
  }
  if (/header/.test(t)) return 'sample-header: value';
  if (/string/.test(t) || !t) {
    const c = enumChoices(f.r);
    if (c && /string/.test(t) && c.length <= 5 && c.every((x) => x.length < 14)) return c[Math.floor(r() * c.length)];
    return textFor(f, ctx);
  }
  return textFor(f, ctx);
}

export interface Row { name: string; value: string; unit: string }
export function rowsFor(item: Item, plat: Plat, t: number): Row[] {
  const ctx: Ctx = { item, plat, t };
  return item.d.f.map((f, i) => ({ name: f.n, value: valueFor(f, ctx, i), unit: f.u || '' }));
}

export function seriesFor(item: Item, plat: Plat, t: number, names: string[]): number[] {
  const ctx: Ctx = { item, plat, t };
  return names.map((n, i) => numberFor({ n, t: 'float', u: '', r: '' }, ctx, i));
}
