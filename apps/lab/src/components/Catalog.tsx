import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Item, Lab, Plat } from '../types';
import { KIND_SHORT, statusOf } from '../data';
import { Icon } from '../icons';
import { Pager } from './Pager';
import { useSize } from '../hooks/misc';

export function StatusDot({ tone, title }: { tone: 'ok' | 'part' | 'no'; title?: string }) {
  return <span className={`sdot ${tone}`} title={title} aria-label={title} />;
}

export function KindPill({ kind }: { kind: string }) {
  return <span className={`kpill k-${kind}`}>{KIND_SHORT[kind] ?? kind}</span>;
}

interface Props {
  lab: Lab; plat: Plat;
  list: Item[]; // fully filtered
  groupCounts: Record<string, number>; groupTotal: number;
  group: string; onGroup: (g: string) => void;
  selected?: string; onSelect: (id: string) => void;
  compact?: boolean;
  jumpTo?: number; // index to reveal
}

const ROW_H = 38;

export function Catalog({ lab, plat, list, groupCounts, groupTotal, group, onGroup, selected, onSelect, compact, jumpTo }: Props) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [gpage, setGpage] = useState(0);
  const [boxRef, size] = useSize<HTMLDivElement>();
  const pageSize = Math.max(3, Math.floor(size.h / ROW_H));
  const pages = Math.max(1, Math.ceil(list.length / pageSize));

  useEffect(() => { setPage(0); }, [group, list.length, plat]);
  useEffect(() => { setPage((p) => Math.min(p, pages - 1)); }, [pages]);
  useEffect(() => {
    if (size.h > 0 && jumpTo != null && jumpTo >= 0) setPage(Math.floor(jumpTo / pageSize));
  }, [jumpTo, pageSize, size.h, group, list.length, plat]);

  const groups = useMemo(() => Object.entries(lab.groups).filter(([g]) => (groupCounts[g] ?? 0) > 0), [lab, groupCounts]);
  const slice = list.slice(page * pageSize, page * pageSize + pageSize);
  const cur = group ? lab.groups[group] : null;

  const GP = 8;
  const gpages = Math.max(1, Math.ceil(groups.length / GP));
  const gp = Math.min(gpage, gpages - 1);
  const shownGroups = compact ? groups : groups.slice(gp * GP, gp * GP + GP);
  const groupGrid = (
    <div className="groups" role="group" aria-label="Groups">
      {shownGroups.map(([g, v]) => (
        <button key={g} className={`grp ${group === g ? 'on' : ''}`} onClick={() => { onGroup(group === g ? '' : g); setOpen(false); }} title={v.description}>
          <Icon name={v.icon} size={14} />
          <span className="grp-l">{v.label}</span>
          <i>{groupCounts[g]}</i>
        </button>
      ))}
    </div>
  );

  return (
    <div className="catalog">
      {compact ? (
        <div className="grp-pop-wrap">
          <button className="grp-select" onClick={() => setOpen(!open)} aria-expanded={open}>
            <Icon name={cur?.icon ?? 'layout-grid'} size={15} />
            <span>{cur ? cur.label : 'All groups'}</span>
            <i>{cur ? groupCounts[group] : groupTotal}</i>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="grp-pop">
              <button className={`grp all ${group === '' ? 'on' : ''}`} onClick={() => { onGroup(''); setOpen(false); }}><Icon name="layout-grid" size={14} /><span className="grp-l">All groups</span><i>{groupTotal}</i></button>
              {groupGrid}
            </div>
          )}
        </div>
      ) : (
        <div className="cat-groups">
          <div className="sec-h"><span>Groups</span>{group && <button className="link-btn" onClick={() => onGroup('')}>Show all {groupTotal}</button>}
            <span className="mini-pager"><button className="icon-btn sm" aria-label="Previous groups" disabled={gp <= 0} onClick={() => setGpage(gp - 1)}><ChevronLeft size={14} /></button><em>{gp + 1}/{gpages}</em><button className="icon-btn sm" aria-label="Next groups" disabled={gp >= gpages - 1} onClick={() => setGpage(gp + 1)}><ChevronRight size={14} /></button></span></div>
          {groupGrid}
        </div>
      )}
      <div className="sec-h list-h">
        <span>{cur ? cur.label : 'All capabilities'}</span>
        <span className="muted">{plat === 'web' ? 'Web' : plat === 'ios' ? 'iPhone' : 'Android'}</span>
      </div>
      <div className="list-box" ref={boxRef}>
        <ul className="list" role="listbox" aria-label="Capabilities">
          {slice.map((it) => {
            const st = statusOf(it, plat, lab.browsers);
            const on = it.id === selected;
            return (
              <li key={it.id} role="option" aria-selected={on}>
                <button data-row className={`row ${on ? 'on' : ''}`} tabIndex={-1} onClick={() => onSelect(it.id)} style={{ height: ROW_H - 2 }}>
                  <span className="row-ic"><Icon name={it.ic || lab.groups[it.g]?.icon} size={15} /></span>
                  <span className="row-n">{it.n}</span>
                  <KindPill kind={it.k} />
                  <StatusDot tone={st.tone} title={st.label} />
                </button>
              </li>
            );
          })}
          {slice.length === 0 && <li className="empty">Nothing matches. Clear a filter or the search.</li>}
        </ul>
      </div>
      <Pager page={page} pages={pages} total={list.length} onPage={setPage} />
    </div>
  );
}
