import type { Item, Lab, Plat } from './types';

export async function loadLab(): Promise<Lab> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/lab.json`);
  if (!res.ok) throw new Error('Could not load data');
  return (await res.json()) as Lab;
}

export const PLAT_LABEL: Record<Plat, string> = { android: 'Android', ios: 'iPhone', web: 'Web' };
export const KIND_SHORT: Record<string, string> = {
  permission: 'Asks first', picker: 'You pick', capability: 'No prompt', action: 'Action',
  signal: 'Silent', tracking: 'Tracking', 'not-exposed': 'Blocked',
};
export const KIND_ORDER = ['permission', 'picker', 'capability', 'action', 'signal', 'tracking', 'not-exposed'];

export const hashOf = (id: string) => id.replace(/\./g, '-');
export function idFromHash(hash: string, items: Item[]): Item | undefined {
  const h = hash.replace(/^#/, '').split('&')[0].toLowerCase();
  if (!h) return undefined;
  return items.find((i) => hashOf(i.id).toLowerCase() === h || i.id.toLowerCase() === h);
}

export function itemsFor(items: Item[], plat: Plat) {
  const space = plat === 'web' ? 'w' : 'm';
  return items.filter((i) => i.sp === space && i.p[plat]);
}

export type StatusTone = 'ok' | 'part' | 'no';
export interface StatusInfo { tone: StatusTone; label: string; version: string; code: string }

export function statusOf(item: Item, plat: Plat, browsers?: Record<string, string>): StatusInfo {
  if (plat === 'web') {
    const w = item.p.web;
    const sup = w ? Object.entries(w.sup) : [];
    const y = sup.filter(([, v]) => v[0] === 'y').length;
    const p = sup.filter(([, v]) => v[0] === 'p' || v[0] === 'f').length;
    const total = sup.length || 7;
    const chrome = w?.sup.chrome;
    const version = chrome && chrome[1] ? `Chrome ${chrome[1]}` : '';
    if (y >= total - 1 && y > 0) return { tone: 'ok', label: `Supported in ${y} of ${total} browsers`, version, code: 'y' };
    if (y + p > 0) return { tone: 'part', label: `Partial: ${y} full, ${p} partial of ${total} browsers`, version, code: 'p' };
    void browsers;
    return { tone: 'no', label: 'No browser supports it', version, code: 'n' };
  }
  const n = item.p[plat];
  const code = n?.s || 'n';
  const osName = plat === 'ios' ? 'iOS' : 'Android';
  const v = n?.v ? `${osName} ${n.v}` : '';
  if (code === 'y') return { tone: 'ok', label: 'Supported', version: v, code };
  if (code === 'p') return { tone: 'part', label: 'Partial support', version: v, code };
  if (code === 'f') return { tone: 'part', label: 'Behind a flag', version: v, code };
  if (code === 'r') return { tone: 'no', label: 'Removed for apps', version: v, code };
  return { tone: 'no', label: 'Not supported', version: v, code };
}
