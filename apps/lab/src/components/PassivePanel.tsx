import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import type { Item } from '../types';
import { collectPassive, type PassiveSignal } from '../realAdapter';
import { Pager } from './Pager';

export function usePassive(): PassiveSignal[] | null {
  const [sigs, setSigs] = useState<PassiveSignal[] | null>(null);
  useEffect(() => {
    let ok = true;
    Promise.resolve().then(() => collectPassive()).then((r) => { if (ok) setSigs(r); }).catch(() => { if (ok) setSigs([]); });
    return () => { ok = false; };
  }, []);
  return sigs;
}

export function PassivePanel({ items, sigs, onOpen }: { items: Item[]; sigs: PassiveSignal[] | null; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const groups = useMemo(() => {
    const m = new Map<string, PassiveSignal[]>();
    (sigs ?? []).forEach((s) => { const a = m.get(s.group) ?? []; a.push(s); m.set(s.group, a); });
    return [...m.entries()];
  }, [sigs]);
  type Row = { head?: string; count?: number; s?: PassiveSignal };
  const flat = useMemo<Row[]>(() => groups.flatMap(([g, list]) => [{ head: g, count: list.length } as Row, ...list.map((s): Row => ({ s }))]), [groups]);
  const PS = 9;
  const pages = Math.max(1, Math.ceil(flat.length / PS));
  const pg = Math.min(page, pages - 1);
  const slice = flat.slice(pg * PS, pg * PS + PS);
  return (
    <div className="passive">
      <div className="passive-hero">
        <Eye size={18} />
        <div>
          <b>{sigs === null ? 'Reading this page...' : `This page learned ${sigs.length} things about you without asking`}</b>
          <span>No prompt appeared. This is what any site can read the moment it loads.</span>
        </div>
      </div>
      <div className="passive-list">
        {slice.map((r, i) => r.head ? (
          <div key={`h${r.head}${i}`} className="passive-group">{r.head} <em>{r.count}</em></div>
        ) : r.s ? (
          <div key={r.s.id + i} className="passive-row">
            <span className="pl">{r.s.label}</span>
            <code title={r.s.detail || r.s.value}>{r.s.value}</code>
            {ids.has(r.s.id) ? <button className="link" onClick={() => onOpen(r.s!.id)}>Open</button> : <span className="nolink" />}
          </div>
        ) : null)}
      </div>
      <Pager page={pg} pages={pages} total={sigs?.length ?? 0} onPage={setPage} label="signals" />
    </div>
  );
}
