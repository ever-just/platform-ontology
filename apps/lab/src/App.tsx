import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, Eye, Layers, Smartphone, Workflow, Monitor } from 'lucide-react';
import type { Item, Lab, Plat } from './types';
import { hashOf, idFromHash, itemsFor, loadLab } from './data';
import { buildPlan } from './sim/flow';
import { useSim } from './hooks/useSim';
import { useMedia } from './hooks/misc';
import { Brand, KindChips, Links, PlatformSwitch, SearchBox } from './components/TopBar';
import { Catalog } from './components/Catalog';
import { BrowserDevice, PhoneDevice } from './components/Device';
import { FlowMap } from './components/FlowMap';
import { DataView } from './components/DataView';
import { PassivePanel, usePassive } from './components/PassivePanel';
import { Brief } from './components/Brief';

type MTab = 'catalog' | 'device' | 'flow' | 'data';

function initialPlat(): Plat {
  const h = window.location.hash.toLowerCase();
  if (/&ios\b/.test(h)) return 'ios';
  if (/&android\b/.test(h)) return 'android';
  if (/&web\b/.test(h)) return 'web';
  return /^#(web|w)[-.]/.test(h) ? 'web' : 'android';
}

function Lab_({ lab }: { lab: Lab }) {
  const phone = useMedia('(max-width: 859px)');
  const [plat, setPlat] = useState<Plat>(initialPlat);
  const [group, setGroup] = useState('');
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  const [selId, setSelId] = useState<string>(() => idFromHash(window.location.hash, lab.items)?.id ?? '');
  const [selNode, setSelNode] = useState('trigger');
  const [right, setRight] = useState<'data' | 'passive'>('data');
  const [mtab, setMtab] = useState<MTab>('catalog');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sigs = usePassive();

  const base = useMemo(() => itemsFor(lab.items, plat), [lab, plat]);
  const q = query.trim().toLowerCase();
  const matchQ = useCallback((i: Item) => !q || `${i.n} ${i.id} ${i.pl} ${i.tg.join(' ')}`.toLowerCase().includes(q), [q]);
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    base.forEach((i) => { if ((!group || i.g === group) && matchQ(i)) c[i.k] = (c[i.k] ?? 0) + 1; });
    return c;
  }, [base, group, matchQ]);
  const groupCounts = useMemo(() => {
    const c: Record<string, number> = {};
    base.forEach((i) => { if ((!kind || i.k === kind) && matchQ(i)) c[i.g] = (c[i.g] ?? 0) + 1; });
    return c;
  }, [base, kind, matchQ]);
  const list = useMemo(() => base.filter((i) => (!group || i.g === group) && (!kind || i.k === kind) && matchQ(i)), [base, group, kind, matchQ]);
  const groupTotal = useMemo(() => Object.values(groupCounts).reduce((a, b) => a + b, 0), [groupCounts]);

  const item: Item | undefined = useMemo(
    () => base.find((i) => i.id === selId) ?? list[0] ?? base[0],
    [base, list, selId],
  );
  const idx = item ? list.findIndex((i) => i.id === item.id) : -1;

  // when the platform changes, fix selection so it exists for that platform
  useEffect(() => {
    if (!item) return;
    if (item.id !== selId) setSelId(item.id);
  }, [item, selId]);

  // hash sync
  useEffect(() => {
    if (!item) return;
    const h = `#${hashOf(item.id)}${plat === 'ios' ? '&ios' : plat === 'web' ? '' : ''}`;
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [item, plat]);
  useEffect(() => {
    const on = () => {
      const it = idFromHash(window.location.hash, lab.items);
      if (!it) return;
      setPlat((p) => (it.sp === 'w' ? 'web' : p === 'web' ? 'android' : p));
      setSelId(it.id);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [lab]);
  // initial hash may point to a web item while plat defaulted
  useEffect(() => {
    const it = idFromHash(window.location.hash, lab.items);
    if (it && it.sp === 'w' && plat !== 'web') setPlat('web');
    if (it && it.sp === 'm' && plat === 'web') setPlat('android');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = useMemo(() => (item ? buildPlan(item, plat) : null), [item, plat]);
  const sim = useSim(plan!, `${item?.id}|${plat}`);
  const { sim: s } = sim;
  useEffect(() => { setSelNode(s.cur); }, [s.cur]);
  useEffect(() => { setSelNode('trigger'); }, [item?.id, plat]);

  const select = useCallback((id: string, goDevice = false) => {
    setSelId(id);
    if (goDevice) setMtab('device');
  }, []);

  const move = useCallback((d: number) => {
    if (!list.length) return;
    const i = idx < 0 ? 0 : Math.min(list.length - 1, Math.max(0, idx + d));
    setSelId(list[i].id);
  }, [list, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'Escape' && typing) { (t as HTMLElement).blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing && !(e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        const row = t?.closest('[data-row]');
        if (typing || row || tag === 'BODY' || t?.id === 'root' || !t) { e.preventDefault(); if (s.phase === 'idle' || s.phase === 'denied' || s.phase === 'revoked' || s.phase === 'blocked' || s.phase === 'granted' || s.phase === 'silent') sim.trigger(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, sim, s.phase]);

  if (!item || !plan) return <div className="boot">No capabilities match.</div>;
  const nat = plat === 'web' ? undefined : item.p[plat];
  const web = plat === 'web' ? item.p.web : undefined;
  const dev = {
    plat, item, plan, sim: s, iconName: item.ic, settingsPath: nat?.rv ?? web?.rv ?? '',
    onTrigger: sim.trigger, onChoose: sim.choose, onSettingsSet: sim.settingsSet, onRevoke: sim.revoke,
  };
  const device = plat === 'web' ? <BrowserDevice {...dev} /> : <PhoneDevice {...dev} />;
  const catalog = (
    <Catalog lab={lab} plat={plat} list={list} groupCounts={groupCounts} groupTotal={groupTotal} group={group} onGroup={setGroup}
      selected={item.id} onSelect={(id) => select(id, phone)} compact={phone} jumpTo={idx} />
  );
  const flow = <FlowMap item={item} plat={plat} plan={plan} sim={s} selected={selNode} onSelect={setSelNode} />;
  const rightToggle = (
    <div className="seg sm" role="tablist" aria-label="Right panel">
      <button role="tab" aria-selected={right === 'data'} className={right === 'data' ? 'on' : ''} onClick={() => setRight('data')}><Database size={13} /><span>Live data</span></button>
      <button role="tab" aria-selected={right === 'passive'} className={right === 'passive' ? 'on' : ''} onClick={() => setRight('passive')}><Eye size={13} /><span>Passive data</span>{sigs && <i>{sigs.length}</i>}</button>
    </div>
  );
  const dataPane = right === 'data' ? <DataView item={item} plat={plat} sim={s} /> : <PassivePanel items={lab.items} sigs={sigs} onOpen={(id) => { const it = lab.items.find((x) => x.id === id); if (it) { setPlat((p) => (it.sp === 'w' ? 'web' : p === 'web' ? 'android' : p)); setGroup(''); setKind(''); setQuery(''); setSelId(id); setRight('data'); } }} />;

  const chips = <KindChips lab={lab} counts={kindCounts} kind={kind} onKind={setKind} />;

  if (phone) {
    return (
      <div className="app-root phone-mode">
        <header className="topbar">
          <Brand compact />
          <PlatformSwitch plat={plat} onPlat={setPlat} />
        </header>
        <main className="mbody">
          {mtab === 'catalog' && (
            <section className="pane catalog-pane">
              <SearchBox value={query} onChange={setQuery} inputRef={searchRef} />
              {chips}
              {catalog}
            </section>
          )}
          {mtab === 'device' && (
            <section className="pane device-pane">
              <div className="mini-brief"><b>{item.n}</b><span>{item.l.h}</span></div>
              <div className="stage">{device}</div>
            </section>
          )}
          {mtab === 'flow' && <section className="pane flow-pane">{flow}</section>}
          {mtab === 'data' && (
            <section className="pane data-pane">
              <Brief lab={lab} item={item} plat={plat} />
              <div className="right-toggle">{rightToggle}</div>
              <div className="data-box">{dataPane}</div>
            </section>
          )}
        </main>
        <nav className="tabbar" aria-label="Sections">
          {([['catalog', Layers, 'Catalog'], ['device', plat === 'web' ? Monitor : Smartphone, 'Device'], ['flow', Workflow, 'Flow'], ['data', Database, 'Data']] as const).map(([id, Ic, lab_]) => (
            <button key={id} className={mtab === id ? 'on' : ''} onClick={() => setMtab(id)} aria-current={mtab === id}><Ic size={19} /><span>{lab_}</span></button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="app-root">
      <header className="topbar">
        <Brand />
        <PlatformSwitch plat={plat} onPlat={setPlat} />
        <SearchBox value={query} onChange={setQuery} inputRef={searchRef} />
        {chips}
        <Links />
      </header>
      <main className="cols">
        <aside className="col col-left">{catalog}</aside>
        <section className="col col-center">
          <Brief lab={lab} item={item} plat={plat} />
          <div className="stage">{device}</div>
        </section>
        <aside className="col col-right">
          <div className="panel flow-panel"><div className="panel-h"><b>Flow map</b><span>Click a node for details</span></div>{flow}</div>
          <div className="panel data-panel"><div className="panel-h">{rightToggle}</div><div className="data-box">{dataPane}</div></div>
        </aside>
      </main>
    </div>
  );
}

export default function App() {
  const [lab, setLab] = useState<Lab | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { loadLab().then(setLab).catch((e) => setErr(String(e.message || e))); }, []);
  if (err) return <div className="boot">Could not load the data. {err}</div>;
  if (!lab) return <div className="boot"><span className="spin" /> Loading the dataset...</div>;
  return <Lab_ lab={lab} />;
}
