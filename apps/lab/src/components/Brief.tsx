import { Check, X } from 'lucide-react';
import type { Item, Lab, Plat } from '../types';
import { statusOf, PLAT_LABEL } from '../data';
import { GRANT_LABEL } from '../sim/flow';

export function Brief({ lab, item, plat }: { lab: Lab; item: Item; plat: Plat }) {
  const st = statusOf(item, plat, lab.browsers);
  const nat = plat === 'web' ? undefined : item.p[plat];
  const web = plat === 'web' ? item.p.web : undefined;
  const grant = nat?.g ?? web?.g ?? '';
  const reachLabel = lab.reach[String(item.l.r)] || item.l.rl;
  return (
    <div className="brief">
      <div className="brief-top">
        <h2>{item.n}</h2>
        <p>{item.l.h || item.pl}</p>
      </div>
      <div className="brief-cols">
        <ul className="can">{item.l.c.slice(0, 2).map((c, i) => <li key={i}><Check size={12} /><span>{c}</span></li>)}</ul>
        <ul className="cannot">{item.l.x.slice(0, 2).map((c, i) => <li key={i}><X size={12} /><span>{c}</span></li>)}</ul>
      </div>
      <div className="brief-meta">
        <div className="reach" title={`Reach ${item.l.r} of 4`}>
          <span className="lab">Reach</span>
          <span className="reach-bar">{[1, 2, 3, 4].map((n) => <i key={n} className={n <= item.l.r ? 'on' : ''} />)}</span>
          <b>{item.l.rl || reachLabel}</b>
        </div>
        <div><span className="lab">{PLAT_LABEL[plat]}</span><b className={`tone-${st.tone}`}>{st.label}</b>{st.version && <em> from {st.version}</em>}</div>
        <div><span className="lab">Sensitivity</span><b>{item.s}</b><em> of 10</em></div>
        {grant && <div><span className="lab">Access</span><b>{GRANT_LABEL[grant] ?? grant}</b></div>}
      </div>
    </div>
  );
}
