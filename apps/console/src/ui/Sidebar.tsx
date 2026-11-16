import { useMemo, useState } from "react";
import { Search, Globe } from "lucide-react";
import type { Atlas, DomainId, ScopeDef } from "../core/types";
import { getSession, useVersion } from "../core/harness";
import { DOMAIN_COLOR } from "./kit";
import { supportOf, type Profile } from "../browser/profile";

export function Sidebar({ atlas, scopes, selected, onSelect, profile, browserOn, onBrowser }: { atlas: Atlas; scopes: ScopeDef[]; selected: string; onSelect: (id: string) => void; profile: Profile; browserOn: boolean; onBrowser: () => void }) {
  useVersion();
  const [q, setQ] = useState("");
  const [here, setHere] = useState(false);
  const supOf = (sc: ScopeDef) => { const n = atlas.nodes.find((x) => x.i === sc.atlas[0]); return n ? supportOf(n.sup, profile.column) : "u"; };
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    return atlas.domains.map((d) => ({
      d,
      list: scopes.filter((s) => s.domain === d.id && (!here || "yp".includes(supOf(s))) && (!t || (s.name + " " + s.id + " " + s.summary).toLowerCase().includes(t))),
    }));
  }, [atlas, scopes, q, here, profile.column]);
  return (
    <aside className="side">
      <label className="search">
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scopes" />
      </label>
      <div className="side-top">
        <button className={"sc here" + (browserOn ? " on" : "")} onClick={onBrowser}><Globe size={14} /><span className="sc-n">This browser</span><em className="tag">{profile.brand}</em></button>
      </div>
      <label className="here-f"><input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} /> Only what works in {profile.columnLabel}</label>
      <div className="side-list">
        {groups.map(({ d, list }) => list.length === 0 && q ? null : (
          <section key={d.id} className="dom">
            <button className="dom-h" onClick={() => setShut({ ...shut, [d.id]: !shut[d.id] })}>
              <i style={{ background: DOMAIN_COLOR[d.id as DomainId] }} />
              <span>{d.name}</span>
              <em>{list.length} / {d.count}</em>
            </button>
            {!shut[d.id] && list.map((s) => {
              const st = getSession(s.id).state;
              return (
                <button key={s.id} className={"sc" + (s.id === selected ? " on" : "")} onClick={() => onSelect(s.id)}>
                  <span className={"dot st-" + st} />
                  <span className="sc-n">{s.name}</span>
                  {s.passive ? <em className="tag">silent</em> : s.permission ? <em className="tag">prompt</em> : null}
                  <i className={"sup sup-" + supOf(s)} title={"In " + profile.columnLabel + ": " + supOf(s)} />
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </aside>
  );
}
