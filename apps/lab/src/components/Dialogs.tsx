import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Lock, Settings as SettingsIcon, X } from 'lucide-react';
import type { Item, Opt, Plat } from '../types';
import type { PromptInfo } from '../sim/flow';
import { APP_NAME, SITE } from '../sim/flow';
import { Icon } from '../icons';

function useMenuKeys(onEscape?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const b = el.querySelector<HTMLButtonElement>('button[data-opt]');
    b?.focus({ preventScroll: true });
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el) return;
    const btns = Array.from(el.querySelectorAll<HTMLButtonElement>('button[data-opt]'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape?.(); }
    else if (e.key === 'Enter') { e.stopPropagation(); }
  };
  return { ref, onKeyDown };
}

const denyOpt = (opts: Opt[]) => opts.find((o) => !o.allow) ?? opts[opts.length - 1];

export function AndroidPermissionDialog({ prompt, iconName, onChoose }: { prompt: PromptInfo; iconName: string; onChoose: (o: Opt) => void }) {
  const { ref, onKeyDown } = useMenuKeys(() => onChoose(denyOpt(prompt.options)));
  return (
    <div className="scrim center">
      <div className="a-dialog" role="alertdialog" aria-label={prompt.title} ref={ref} onKeyDown={onKeyDown}>
        <div className="a-dialog-ic"><Icon name={iconName} size={22} /></div>
        <h4>{prompt.title}</h4>
        <div className="a-dialog-btns">
          {prompt.options.map((o) => (
            <button key={o.label} data-opt className={o.allow ? 'allow' : 'deny'} onClick={() => onChoose(o)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IosAlert({ prompt, onChoose }: { prompt: PromptInfo; onChoose: (o: Opt) => void }) {
  const { ref, onKeyDown } = useMenuKeys(() => onChoose(denyOpt(prompt.options)));
  const horizontal = prompt.options.length === 2;
  return (
    <div className="scrim center ios">
      <div className="i-alert" role="alertdialog" aria-label={prompt.title} ref={ref} onKeyDown={onKeyDown}>
        <div className="i-alert-t"><h4>{prompt.title}</h4><p>{prompt.body}</p></div>
        <div className={`i-alert-btns ${horizontal ? 'h' : 'v'}`}>
          {prompt.options.map((o, idx) => (
            <button key={o.label} data-opt className={idx === 0 && o.allow ? 'pref' : ''} onClick={() => onChoose(o)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChromeBubble({ prompt, iconName, onChoose }: { prompt: PromptInfo; iconName: string; onChoose: (o: Opt) => void }) {
  const { ref, onKeyDown } = useMenuKeys(() => onChoose(denyOpt(prompt.options)));
  return (
    <div className="scrim top">
      <div className="bubble" role="dialog" aria-label={`${SITE} permission request`} ref={ref} onKeyDown={onKeyDown}>
        <div className="bubble-arrow" />
        <button className="bubble-x" aria-label="Close and block" data-opt onClick={() => onChoose(denyOpt(prompt.options))}><X size={14} /></button>
        <div className="bubble-h"><Lock size={13} /> <b>{SITE}</b> wants to</div>
        <div className="bubble-row"><Icon name={iconName} size={16} /><span>{prompt.body}</span></div>
        <div className="bubble-btns">
          {prompt.options.map((o) => (
            <button key={o.label} data-opt className={o.allow ? 'allow' : 'deny'} onClick={() => onChoose(o)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SheetPrompt({ plat, prompt, iconName, onChoose }: { plat: Plat; prompt: PromptInfo; iconName: string; onChoose: (o: Opt) => void }) {
  const { ref, onKeyDown } = useMenuKeys(() => onChoose(denyOpt(prompt.options)));
  return (
    <div className={`scrim ${plat === 'web' ? 'center' : 'bottom'}`}>
      <div className={`sheet ${plat}`} role="dialog" aria-label={prompt.title} ref={ref} onKeyDown={onKeyDown}>
        <div className="sheet-grab" />
        <div className="sheet-ic"><Icon name={iconName} size={20} /></div>
        <h4>{prompt.title}</h4>
        <p>{prompt.body}</p>
        <div className="sheet-btns">
          {prompt.options.map((o) => (
            <button key={o.label} data-opt className={o.allow ? 'allow' : 'deny'} onClick={() => onChoose(o)}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Picker ---------- */
const NAMES = ['Ava Chen', 'Marcus Webb', 'Priya Nair', 'Leo Santos', 'Hana Ito', 'Sam Rivera'];
export function PickerSheet({ plat, item, onDone }: { plat: Plat; item: Item; onDone: (o: Opt | null, n: number) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const kind = /contact/.test(item.id) ? 'contacts' : /file|document|storage|folder/.test(item.id) ? 'files' : /photo|media|image|video|camera/.test(item.id) ? 'photos' : 'items';
  const toggle = (i: number) => setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  const { ref, onKeyDown } = useMenuKeys(() => onDone(null, 0));
  const cells = [0, 1, 2, 3, 4, 5];
  return (
    <div className={`scrim ${plat === 'web' ? 'center' : 'bottom'}`}>
      <div className={`sheet picker ${plat}`} role="dialog" aria-label="Picker" ref={ref} onKeyDown={onKeyDown}>
        <div className="sheet-grab" />
        <div className="picker-h"><b>Choose {kind}</b><span>{APP_NAME} only sees what you pick</span></div>
        {kind === 'photos' || kind === 'items' ? (
          <div className="picker-grid">
            {cells.map((i) => (
              <button key={i} data-opt className={`tile t${i % 6} ${sel.includes(i) ? 'on' : ''}`} onClick={() => toggle(i)} aria-pressed={sel.includes(i)} aria-label={`Item ${i + 1}`}>
                {sel.includes(i) && <span className="tick"><Check size={12} /></span>}
              </button>
            ))}
          </div>
        ) : (
          <ul className="picker-list">
            {cells.slice(0, 5).map((i) => (
              <li key={i}>
                <button data-opt className={sel.includes(i) ? 'on' : ''} onClick={() => toggle(i)} aria-pressed={sel.includes(i)}>
                  <span className="av">{kind === 'contacts' ? NAMES[i][0] : <Icon name="file" size={13} />}</span>
                  <span>{kind === 'contacts' ? NAMES[i] : ['report.pdf', 'notes.txt', 'budget.xlsx', 'trip.jpg', 'draft.docx'][i]}</span>
                  {sel.includes(i) && <Check size={14} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-btns row">
          <button data-opt className="deny" onClick={() => onDone(null, 0)}>Cancel</button>
          <button data-opt className="allow" disabled={sel.length === 0} onClick={() => onDone({ label: `Shared ${sel.length} ${sel.length === 1 ? 'item' : 'items'}`, allow: true, scope: 'limited' }, sel.length)}>Share {sel.length || ''}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Settings ---------- */
export function SettingsSheet({ plat, item, path, on, onSet, onClose, asGrant }: { plat: Plat; item: Item; path: string; on: boolean; onSet: (v: boolean) => void; onClose: () => void; asGrant: boolean }) {
  const { ref, onKeyDown } = useMenuKeys(onClose);
  const crumbs = (path || (plat === 'web' ? 'Site settings' : 'Settings > Apps > Permissions')).split('>').map((s) => s.trim()).filter(Boolean);
  const body: ReactNode = (
    <>
      <div className="set-h">
        <SettingsIcon size={15} />
        <span className="crumbs">{crumbs.map((c, i) => (<span key={i}>{i > 0 && <ChevronRight size={11} />}{c}</span>))}</span>
        <button data-opt className="icon-btn sm" aria-label="Close settings" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="set-row">
        <div><b>{item.n}</b><span>{plat === 'web' ? SITE : APP_NAME}</span></div>
        <button data-opt role="switch" aria-checked={on} className={`switch ${on ? 'on' : ''}`} onClick={() => onSet(!on)}><i /></button>
      </div>
      <p className="set-note">{asGrant ? 'This has no pop up. Turning the switch on is the grant.' : on ? 'Turn it off to revoke. The app loses access right away.' : 'Turn it on to allow it again.'}</p>
    </>
  );
  return (
    <div className={`scrim ${plat === 'web' ? 'top' : 'bottom'}`}>
      <div className={`sheet settings ${plat}`} role="dialog" aria-label="Settings" ref={ref} onKeyDown={onKeyDown}>
        {plat !== 'web' && <div className="sheet-grab" />}
        {body}
      </div>
    </div>
  );
}
