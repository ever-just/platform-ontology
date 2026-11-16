import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Battery, Camera, Home, Lock, Menu, Mic, MapPin, RotateCw, Search as SearchI, Signal, Settings, ShieldAlert, ShieldCheck, ShieldOff, User, Wifi, X, Zap } from 'lucide-react';
import type { Item, Opt, Plat } from '../types';
import type { Plan } from '../sim/flow';
import { APP_NAME, SITE } from '../sim/flow';
import type { Sim } from '../hooks/useSim';
import { Icon } from '../icons';
import { useSize, useTicker } from '../hooks/misc';
import { rowsFor, isLive } from '../sim/values';
import { AndroidPermissionDialog, ChromeBubble, IosAlert, PickerSheet, SettingsSheet, SheetPrompt } from './Dialogs';

export interface DeviceProps {
  plat: Plat; item: Item; plan: Plan; sim: Sim;
  iconName: string; settingsPath: string;
  onTrigger: () => void; onChoose: (o: Opt) => void; onSettingsSet: (v: boolean) => void; onRevoke: () => void;
  compact?: boolean;
}

function indicatorOf(item: Item): 'camera' | 'mic' | 'location' | null {
  const id = item.id;
  if (/camera|display-capture|screen/.test(id) && !/microphone/.test(id)) return 'camera';
  if (/microphone|audio-record|speech/.test(id)) return 'mic';
  if (/location|geolocation/.test(id)) return 'location';
  return null;
}

function MiniReadout({ item, plat, live }: { item: Item; plat: Plat; live: boolean }) {
  const t = useTicker(live, 4);
  const rows = rowsFor(item, plat, t + 3).slice(0, 2);
  if (!rows.length) return null;
  return (
    <div className="app-mini" aria-label="What the app received">
      {rows.map((r) => (
        <div key={r.name}><span>{r.name}</span><b>{r.value}{r.unit ? ` ${r.unit}` : ''}</b></div>
      ))}
    </div>
  );
}

function AppScreen({ plat, item, plan, sim, onTrigger, onRevoke, onOpenSettings }: DeviceProps & { onOpenSettings: () => void }) {
  const phase = sim.phase;
  const silent = plan.mode === 'silent';
  const seesLine = plat === 'web' ? 'The page got a NotAllowedError.' : plat === 'android' ? 'The app got PERMISSION_DENIED.' : 'The app sees status: denied.';
  let status: ReactNode = null;
  if (phase === 'granted' || phase === 'silent') {
    status = silent ? (
      <div className="app-note silent"><span className="pulse" /><div><b>Collected silently</b><span>No prompt was shown. The {plat === 'web' ? 'page' : 'app'} just read it.</span></div></div>
    ) : (
      <div className="app-note ok"><ShieldCheck size={16} /><div><b>Access granted</b><span>{sim.choice && sim.choice !== 'auto' ? sim.choice : 'No prompt was needed'}</span></div></div>
    );
  } else if (phase === 'denied') {
    status = <div className="app-note no"><ShieldOff size={16} /><div><b>Denied</b><span>{seesLine}</span></div></div>;
  } else if (phase === 'revoked') {
    status = <div className="app-note no"><ShieldOff size={16} /><div><b>Access revoked</b><span>The data stopped right away.</span></div></div>;
  } else if (phase === 'blocked') {
    status = <div className="app-note block"><Lock size={16} /><div><b>Blocked</b><span>{plan.blockedReason}</span></div></div>;
  } else if (phase === 'checking') {
    status = <div className="app-note wait"><span className="spin" /><div><b>Working...</b><span>Checks are running.</span></div></div>;
  }
  const canRevoke = (phase === 'granted') && plan.mode !== 'silent' && plan.mode !== 'blocked';
  const showMini = (phase === 'granted' || phase === 'silent') && item.d.f.length > 0;
  const web = plat === 'web';
  return (
    <div className={`app app-${plat}`}>
      {plat === 'android' && (
        <div className="app-bar"><Menu size={18} /><b>{APP_NAME}</b><span className="sp" /><span className="avatar"><User size={13} /></span></div>
      )}
      {plat === 'ios' && (
        <div className="app-bar"><span className="ios-sub">Today</span><h2>{APP_NAME}</h2></div>
      )}
      {web && (
        <div className="app-bar"><img src={`${import.meta.env.BASE_URL}mark.svg`} width={16} height={16} alt="" /><b>{APP_NAME}</b><span className="sp" /><span className="navl">Explore</span><span className="navl">Maps</span><span className="navl">Account</span></div>
      )}
      <div className="app-body">
        <div className="app-card">
          <div className="app-ic"><Icon name={item.ic} size={24} strokeWidth={1.6} /></div>
          <h3>{item.n}</h3>
          <p>{item.pl}</p>
          {silent ? (
            <button className="cta ghost" onClick={onTrigger}><RotateCw size={14} /> Replay collection</button>
          ) : (
            <button className="cta" onClick={onTrigger} disabled={phase === 'checking'}>{phase === 'idle' || phase === 'checking' ? plan.button : phase === 'blocked' ? 'Try again' : 'Run again'}</button>
          )}
          {phase === 'idle' && !silent && <span className="app-hint">{item.l.a || 'Tap the button to start.'}</span>}
        </div>
        {status}
        {showMini && <MiniReadout item={item} plat={plat} live={isLive(item)} />}
        {phase === 'denied' && (
          <button className="cta ghost sm" onClick={onOpenSettings}><Settings size={14} /> {web ? 'Site settings' : 'Open Settings'}</button>
        )}
        {canRevoke && (
          <button className="cta ghost sm" onClick={onRevoke}><ShieldAlert size={14} /> Revoke in {web ? 'site settings' : 'Settings'}</button>
        )}
      </div>
      {!web && (
        <div className="app-tabs"><span className="on"><Home size={16} /></span><span><SearchI size={16} /></span><span><Zap size={16} /></span><span><User size={16} /></span></div>
      )}
    </div>
  );
}

function Overlays(p: DeviceProps & { settingsOpen: boolean; setSettingsOpen: (b: boolean) => void }) {
  const { plat, plan, sim, item } = p;
  const phase = sim.phase;
  const prompt = plan.prompt;
  const fakeOn = phase === 'granted';
  return (
    <>
      {phase === 'prompt' && prompt && (
        prompt.style === 'sheet' ? <SheetPrompt plat={plat} prompt={prompt} iconName={p.iconName} onChoose={p.onChoose} />
        : plat === 'android' ? <AndroidPermissionDialog prompt={prompt} iconName={p.iconName} onChoose={p.onChoose} />
        : plat === 'ios' ? <IosAlert prompt={prompt} onChoose={p.onChoose} />
        : <ChromeBubble prompt={prompt} iconName={p.iconName} onChoose={p.onChoose} />
      )}
      {phase === 'picker' && (
        <PickerSheet plat={plat} item={item} onDone={(o) => { if (o) p.onChoose(o); else p.onChoose({ label: 'Cancel', allow: false, scope: 'deny' }); }} />
      )}
      {phase === 'settings' && (
        <SettingsSheet plat={plat} item={item} path={p.settingsPath} on={false} asGrant onSet={(v) => p.onSettingsSet(v)} onClose={() => p.onSettingsSet(false)} />
      )}
      {p.settingsOpen && phase !== 'settings' && (
        <SettingsSheet plat={plat} item={item} path={p.settingsPath} on={fakeOn} asGrant={false}
          onSet={(v) => { p.setSettingsOpen(false); if (v) p.onSettingsSet(true); else p.onRevoke(); }} onClose={() => p.setSettingsOpen(false)} />
      )}
    </>
  );
}

function StatusBar({ plat, ind }: { plat: Plat; ind: 'camera' | 'mic' | 'location' | null }) {
  const dot = ind === 'camera' ? 'cam' : ind === 'mic' ? 'mic' : '';
  return (
    <div className={`statusbar sb-${plat}`}>
      <span className="sb-time">9:41</span>
      <span className="sb-right">
        {ind === 'location' && <MapPin size={12} />}
        {dot && <i className={`priv ${dot}`} title={ind === 'camera' ? 'Camera in use' : 'Microphone in use'} />}
        <Signal size={12} /><Wifi size={12} /><Battery size={14} />
      </span>
    </div>
  );
}

export function PhoneDevice(p: DeviceProps) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const W = 300; const H = 620;
  const s = size.w && size.h ? Math.min(size.w / W, size.h / H, 1.2) : 0.5;
  const ind = p.sim.phase === 'granted' ? indicatorOf(p.item) : null;
  return (
    <div className="fit" ref={ref}>
      <div className="fit-inner" style={{ width: W * s, height: H * s }}>
        <div className={`phone phone-${p.plat}`} style={{ width: W, height: H, transform: `scale(${s})` }}>
          <div className="screen">
            {p.plat === 'ios' && <div className="island"><i className={ind === 'camera' ? 'dot cam' : ind === 'mic' ? 'dot mic' : 'dot'} /></div>}
            {p.plat === 'android' && <div className="punch" />}
            <StatusBar plat={p.plat} ind={ind} />
            <AppScreen {...p} onOpenSettings={() => setSettingsOpen(true)} />
            <div className={p.plat === 'ios' ? 'home-ind' : 'gesture-bar'} />
            <Overlays {...p} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrowserDevice(p: DeviceProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ind = p.sim.phase === 'granted' ? indicatorOf(p.item) : null;
  return (
    <div className="fit browser-fit">
      <div className="browser">
        <div className="b-tabs">
          <span className="lights"><i /><i /><i /></span>
          <span className="b-tab"><img src={`${import.meta.env.BASE_URL}mark.svg`} width={13} height={13} alt="" /><span>{APP_NAME} | {SITE}</span>{ind && <i className={`priv ${ind === 'camera' ? 'cam' : ind === 'mic' ? 'mic' : 'loc'}`} />}<X size={12} /></span>
        </div>
        <div className="b-bar">
          <ArrowLeft size={15} /><ArrowRight size={15} /><RotateCw size={14} />
          <span className="b-url"><button className="b-lock" aria-label="Site settings" onClick={() => setSettingsOpen(true)}><Lock size={12} /></button><span>{SITE}</span>
            {ind === 'camera' && <Camera size={12} className="b-ind" />}{ind === 'mic' && <Mic size={12} className="b-ind" />}{ind === 'location' && <MapPin size={12} className="b-ind" />}
          </span>
          <span className="b-menu"><i /><i /><i /></span>
        </div>
        <div className="b-page">
          <AppScreen {...p} onOpenSettings={() => setSettingsOpen(true)} />
          <Overlays {...p} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} />
        </div>
      </div>
    </div>
  );
}
