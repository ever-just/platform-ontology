import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera as CamI, Play, Square, Radio } from 'lucide-react';
import type { Item, Plat } from '../types';
import type { Sim } from '../hooks/useSim';
import { hzOf, isLive, parseRange, rowsFor, seriesFor, vizOf, type Row } from '../sim/values';
import { useTicker } from '../hooks/misc';
import { Pager } from './Pager';
import { hasReal, realHandlers, type RealResult } from '../realAdapter';

function num(v: string): number { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }

function MapViz({ rows, t }: { rows: Row[]; t: number }) {
  const lat = rows.find((r) => /^lat/i.test(r.name));
  const lon = rows.find((r) => /^(lon|lng)/i.test(r.name));
  const acc = rows.find((r) => /accuracy/i.test(r.name));
  const ax = 60 + Math.sin(t * 0.5) * 22; const ay = 50 + Math.cos(t * 0.37) * 16;
  const r = Math.max(8, Math.min(34, acc ? num(acc.value) / 3 : 14));
  return (
    <div className="viz viz-map">
      <svg viewBox="0 0 120 100" preserveAspectRatio="xMidYMid slice" aria-label="Map showing a position">
        <rect width="120" height="100" fill="var(--panel)" />
        <g stroke="var(--line)" strokeWidth="0.6" fill="none">
          {[16, 36, 56, 78, 92].map((y) => <path key={y} d={`M0 ${y} L120 ${y + (y % 3) * 2}`} />)}
          {[14, 40, 66, 90, 108].map((x) => <path key={x} d={`M${x} 0 L${x + (x % 4) * 2} 100`} />)}
        </g>
        <g stroke="var(--line-strong)" strokeWidth="1.2" fill="none"><path d="M0 70 C40 60 70 30 120 24" /><path d="M30 0 C40 40 60 80 80 100" /></g>
        <ellipse cx="96" cy="78" rx="16" ry="9" fill="var(--accent-soft)" />
        <circle cx={ax} cy={ay} r={r} fill="var(--accent)" opacity="0.14" />
        <circle cx={ax} cy={ay} r="3.6" fill="var(--accent)" stroke="#fff" strokeWidth="1.4" />
      </svg>
      <span className="viz-cap">{lat && lon ? `${lat.value}, ${lon.value}` : 'Position'}</span>
    </div>
  );
}

function MotionViz({ item, plat, t, names }: { item: Item; plat: Plat; t: number; names: string[] }) {
  const N = 40; const dt = 0.12;
  const series = useMemo(() => {
    const cols: number[][] = names.map(() => []);
    for (let k = N - 1; k >= 0; k--) {
      const v = seriesFor(item, plat, t - k * dt, names);
      v.forEach((x, i) => cols[i].push(x));
    }
    return cols;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, item.id, plat]);
  const colors = ['var(--accent)', 'var(--ink)', 'var(--mute)'];
  return (
    <div className="viz viz-motion">
      <svg viewBox="0 0 160 70" preserveAspectRatio="none" aria-label="Live line chart">
        <g stroke="var(--line)" strokeWidth="0.5"><path d="M0 35 H160" /><path d="M0 12 H160" strokeDasharray="2 3" /><path d="M0 58 H160" strokeDasharray="2 3" /></g>
        {series.map((col, ci) => {
          const lo = Math.min(...col); const hi = Math.max(...col); const sp = hi - lo || 1;
          const d = col.map((v, i) => `${i ? 'L' : 'M'}${(i / (N - 1)) * 160} ${64 - ((v - lo) / sp) * 56}`).join(' ');
          return <path key={ci} d={d} fill="none" stroke={colors[ci % 3]} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      <div className="viz-legend">{names.map((n, i) => <span key={n}><i style={{ background: colors[i % 3] }} />{n}</span>)}</div>
    </div>
  );
}

function AudioViz({ t, rows }: { t: number; rows: Row[] }) {
  const bars = 28;
  const lvl = rows.find((r) => /level|db|amplitude|volume/i.test(r.name));
  return (
    <div className="viz viz-audio">
      <div className="bars" aria-label="Audio level meter">
        {Array.from({ length: bars }, (_, i) => {
          const h = 0.12 + 0.88 * Math.abs(Math.sin(t * 3.1 + i * 0.7) * Math.cos(t * 1.3 + i * 0.31)) * (0.55 + 0.45 * Math.sin(t * 0.9 + i * 0.2) ** 2);
          return <i key={i} style={{ height: `${Math.round(h * 100)}%` }} className={h > 0.82 ? 'hot' : ''} />;
        })}
      </div>
      <span className="viz-cap">{lvl ? `${lvl.value} ${lvl.unit}` : 'Live input level'}</span>
    </div>
  );
}

function CameraViz({ t }: { t: number }) {
  return (
    <div className="viz viz-camera" aria-label="Camera viewfinder placeholder">
      <div className="vf" style={{ backgroundPosition: `${50 + Math.sin(t * 0.4) * 20}% 50%` }} />
      <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
      <span className="rec"><i />LIVE</span>
      <CamI size={22} className="vf-ic" />
      <span className="viz-cap">Placeholder frame. Nothing is recorded here.</span>
    </div>
  );
}

function IdsViz({ rows }: { rows: Row[] }) {
  return (
    <div className="viz viz-ids">
      {rows.slice(0, 4).map((r) => (
        <div key={r.name} className="chip-row"><span>{r.name}</span><code title={r.value}>{r.value}</code></div>
      ))}
    </div>
  );
}

function MeterViz({ item, rows, t }: { item: Item; rows: Row[]; t: number }) {
  const f = item.d.f[0]; const rg = parseRange(f?.r || '') || [0, 100];
  const v = num(rows[0]?.value ?? '0');
  const pct = Math.max(2, Math.min(100, ((v - rg[0]) / (rg[1] - rg[0])) * 100));
  void t;
  return (
    <div className="viz viz-meter">
      <div className="meter"><i style={{ width: `${pct}%` }} /></div>
      <div className="meter-scale"><span>{rg[0]}</span><b>{rows[0]?.value} {rows[0]?.unit}</b><span>{rg[1]}</span></div>
    </div>
  );
}

function Rows({ rows, pageSize }: { rows: Row[]; pageSize: number }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pg = Math.min(page, pages - 1);
  const slice = rows.slice(pg * pageSize, pg * pageSize + pageSize);
  return (
    <div className="rows">
      <table>
        <tbody>
          {slice.map((r) => (
            <tr key={r.name}><th>{r.name}</th><td title={r.value}>{r.value}</td><td className="u">{r.unit}</td></tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && <Pager page={pg} pages={pages} total={rows.length} onPage={setPage} label="fields" />}
    </div>
  );
}

function RealRun({ item }: { item: Item }) {
  const h = realHandlers[item.id];
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [res, setRes] = useState<RealResult | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; try { h?.stop?.(); } catch { /* ignore */ } };
  }, [item.id, h]);
  useEffect(() => {
    const v = videoRef.current;
    if (v && res?.media) { v.srcObject = res.media; void v.play().catch(() => undefined); }
  }, [res]);
  if (!h) return null;
  const run = async () => {
    setState('running'); setRes(null);
    try { const r = await h.run(); if (alive.current) { setRes(r); setState('done'); } }
    catch (e) { if (alive.current) { setRes({ ok: false, fields: [], error: e instanceof Error ? e.message : String(e) }); setState('done'); } }
  };
  const stop = () => { try { h.stop?.(); } catch { /* ignore */ } setRes(null); setState('idle'); };
  return (
    <div className="real">
      <div className="real-head">
        <Radio size={14} />
        <b>Real, in this browser</b>
        {state === 'done' || state === 'running'
          ? <button className="btn sm" onClick={stop}><Square size={12} /> Stop</button>
          : <button className="btn sm accent" onClick={run}><Play size={12} /> Run for real in this browser</button>}
      </div>
      {state === 'running' && <p className="real-note">Waiting for the browser. It may show its own prompt.</p>}
      {res && (
        <div className="real-out">
          {res.media && <video ref={videoRef} className="real-video" muted playsInline autoPlay />}
          {res.error && <p className="real-err">{res.error}</p>}
          {res.note && <p className="real-note">{res.note}</p>}
          {res.fields.length > 0 && (
            <Rows pageSize={4} rows={res.fields.map((f) => ({ name: f.name, value: String(f.value), unit: f.unit || '' }))} />
          )}
        </div>
      )}
    </div>
  );
}

export function DataView({ item, plat, sim }: { item: Item; plat: Plat; sim: Sim }) {
  const on = sim.phase === 'granted' || sim.phase === 'silent';
  const live = on && isLive(item);
  const hz = Math.min(12, Math.max(4, hzOf(item)));
  const t = useTicker(live, hz);
  const viz = vizOf(item);
  const rows = rowsFor(item, plat, on ? t : 0);
  const motionNames = useMemo(() => {
    const n = item.d.f.map((f) => f.n); const xyz = ['x', 'y', 'z'].filter((k) => n.includes(k));
    if (xyz.length) return xyz;
    const ab = ['alpha', 'beta', 'gamma'].filter((k) => n.includes(k));
    return ab.length ? ab : n.slice(0, 3);
  }, [item]);
  const empty = !on;
  const showReal = plat === 'web' && hasReal(item.id);
  const msg =
    sim.phase === 'denied' ? 'No data. The app only got an error.'
    : sim.phase === 'revoked' ? 'Access revoked. The data stopped.'
    : sim.phase === 'blocked' ? 'Blocked. Nothing is delivered.'
    : sim.phase === 'checking' || sim.phase === 'prompt' || sim.phase === 'picker' || sim.phase === 'settings' ? 'Waiting for your choice on the device.'
    : 'Press the trigger to see what this delivers.';
  return (
    <div className="data">
      <div className="data-head">
        <b>{item.d.m ? item.d.m : 'Data'}</b>
        <span className="data-meta">{live ? <><i className="livedot" />{`live, about ${hz} per second`}</> : item.d.u || (on ? 'delivered once' : '')}</span>
      </div>
      {empty ? (
        <div className="data-empty">
          <p>{msg}</p>
          {item.d.f.length > 0 && <Rows pageSize={4} rows={item.d.f.map((f) => ({ name: f.n, value: f.t || 'value', unit: f.r ? f.r.slice(0, 22) : f.u }))} />}
          {item.d.f.length === 0 && <p className="data-sub">{item.l.h}</p>}
        </div>
      ) : (
        <div className="data-live">
          {viz === 'map' && <MapViz rows={rows} t={t} />}
          {viz === 'motion' && <MotionViz item={item} plat={plat} t={t} names={motionNames} />}
          {viz === 'audio' && <AudioViz t={t} rows={rows} />}
          {viz === 'camera' && <CameraViz t={t} />}
          {viz === 'ids' && <IdsViz rows={rows} />}
          {viz === 'meter' && <MeterViz item={item} rows={rows} t={t} />}
          {rows.length > 0 && viz !== 'ids' && <Rows rows={rows} pageSize={viz === 'table' ? 6 : 3} />}
          {rows.length === 0 && <p className="data-sub">{item.l.h}</p>}
        </div>
      )}
      {showReal && <RealRun key={item.id} item={item} />}
    </div>
  );
}
