import { BookOpen, Code2, Library, Search, X } from 'lucide-react';
import type { Lab, Plat } from '../types';
import { KIND_ORDER, KIND_SHORT, PLAT_LABEL } from '../data';
import { Icon } from '../icons';

export function PlatformSwitch({ plat, onPlat }: { plat: Plat; onPlat: (p: Plat) => void }) {
  const opts: { id: Plat; icon: string }[] = [{ id: 'android', icon: 'smartphone' }, { id: 'ios', icon: 'smartphone' }, { id: 'web', icon: 'globe' }];
  return (
    <div className="seg" role="tablist" aria-label="Platform">
      {opts.map((o) => (
        <button key={o.id} role="tab" aria-selected={plat === o.id} className={plat === o.id ? 'on' : ''} onClick={() => onPlat(o.id)}>
          <Icon name={o.icon} size={14} />
          <span>{PLAT_LABEL[o.id]}</span>
        </button>
      ))}
    </div>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <a className="brand" href="/" aria-label="Platform.Ontology home">
      <img src={`${import.meta.env.BASE_URL}mark.svg`} width={26} height={26} alt="" />
      <span className="brand-name">Platform.Ontology <b>Lab</b></span>
      {!compact && <span className="brand-tag">Beta</span>}
    </a>
  );
}

export function Links() {
  return (
    <nav className="links" aria-label="Project links">
      <a href="/" title="Docs"><BookOpen size={14} /><span>Docs</span></a>
      <a href="/wiki/" title="Wiki"><Library size={14} /><span>Wiki</span></a>
      <a href="https://github.com/ever-just/platform-ontology" target="_blank" rel="noreferrer" title="GitHub"><Code2 size={14} /><span>GitHub</span></a>
    </nav>
  );
}

export function SearchBox({ value, onChange, inputRef }: { value: string; onChange: (v: string) => void; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  return (
    <label className="search">
      <Search size={15} />
      <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search 800+ capabilities" aria-label="Search capabilities" />
      {value ? <button className="icon-btn sm" aria-label="Clear search" onClick={() => onChange('')}><X size={13} /></button> : <kbd>/</kbd>}
    </label>
  );
}

export function KindChips({ lab, counts, kind, onKind }: { lab: Lab; counts: Record<string, number>; kind: string; onKind: (k: string) => void }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="chips" role="group" aria-label="Filter by kind">
      <button className={`chip ${kind === '' ? 'on' : ''}`} onClick={() => onKind('')}>All <i>{total}</i></button>
      {KIND_ORDER.map((k) => (
        <button key={k} className={`chip k-${k} ${kind === k ? 'on' : ''}`} onClick={() => onKind(kind === k ? '' : k)} title={lab.kinds[k]?.description}>
          <Icon name={lab.kinds[k]?.icon} size={13} />
          {KIND_SHORT[k]} <i>{counts[k] ?? 0}</i>
        </button>
      ))}
    </div>
  );
}
