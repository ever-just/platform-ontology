import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import type { Atlas, DomainId } from "../core/types";
import type { PassiveSignal } from "../real/types";
import { collectPassive } from "../real/passive";
import { detectProfile, scoreFor, supportOf, type Profile } from "../browser/profile";
import { PERMS, useInternals, usePermissions } from "../browser/engine";
import { DOMAIN_COLOR, Readout, Spark, Stat, C } from "./kit";

const fx = (v: number | null, d = 0) => (v === null ? "n/a" : v.toFixed(d));

export function YourBrowser({ atlas, profile, onSelect, firstSupported }: { atlas: Atlas; profile: Profile; onSelect: (id: string) => void; firstSupported: string }) {
  const [sig, setSig] = useState<PassiveSignal[] | null>(null);
  useEffect(() => { collectPassive().then(setSig).catch(() => setSig([])); }, []);
  const overall = useMemo(() => scoreFor(atlas, profile.column), [atlas, profile.column]);
  const groups = useMemo(() => {
    const m = new Map<string, PassiveSignal[]>();
    (sig || []).forEach((s) => m.set(s.group, [...(m.get(s.group) || []), s]));
    return [...m.entries()];
  }, [sig]);
  const unsupported = overall.no;
  return (
    <div className="yb">
      <section className="yb-hero">
        <div className="yb-id">
          <span className="yb-eyebrow">You are using</span>
          <h2>{profile.brand} <em>{profile.version.split(".")[0] || ""}</em></h2>
          <p>{profile.engine} engine on {profile.os}{profile.osVersion ? " " + profile.osVersion : ""}, {profile.device}{profile.touch ? ", touch" : ", pointer"}. Everything below is read from this tab, on this device. Nothing is uploaded.</p>
          <div className="yb-chips">
            <span className="chip"><b>{profile.engine}</b></span>
            <span className="chip"><b>{profile.os}</b></span>
            <span className="chip">{profile.secure ? <ShieldCheck size={12} /> : <TriangleAlert size={12} />}<b>{profile.secure ? "Secure context" : "Insecure context"}</b></span>
            {profile.standalone && <span className="chip"><b>Installed app</b></span>}
            {profile.uaSpoofed && <span className="chip warn"><b>UA string disagrees with engine</b></span>}
          </div>
          <button className="yb-go" onClick={() => onSelect(firstSupported)}>Try a scope that works here</button>
        </div>
        <div className="yb-score">
          <div className="yb-pct"><b>{overall.pct}</b><span>%</span></div>
          <div className="yb-bar"><i style={{ width: overall.yes / overall.total * 100 + "%", background: C.ok }} /><i style={{ width: overall.partial / overall.total * 100 + "%", background: C.warn }} /><i style={{ width: overall.flag / overall.total * 100 + "%", background: "#bbb" }} /></div>
          <div className="yb-leg"><span><i style={{ background: C.ok }} />{overall.yes} supported</span><span><i style={{ background: C.warn }} />{overall.partial} partial</span><span><i style={{ background: "#bbb" }} />{overall.flag} behind a flag</span><span><i style={{ background: C.err }} />{unsupported} missing</span></div>
          <small>of {overall.total} platform attributes, by {profile.columnLabel} data</small>
        </div>
      </section>

      <section className="yb-sec">
        <h3>What {profile.brand} can reach, by domain</h3>
        <div className="yb-doms">
          {atlas.domains.map((d) => {
            const s = scoreFor(atlas, profile.column, d.id);
            const c = DOMAIN_COLOR[d.id as DomainId];
            return (
              <div key={d.id} className="yb-dom">
                <span><i style={{ background: c }} />{d.short}</span>
                <div className="yb-bar thin"><i style={{ width: s.pct + "%", background: c }} /></div>
                <b>{s.pct}%</b>
              </div>
            );
          })}
        </div>
      </section>

      <section className="yb-sec">
        <h3>Exposed without asking <em>{sig ? sig.length + " signals" : "reading"}</em></h3>
        <p className="yb-sub">Any site can read these silently. This is the same surface fingerprinting scripts use.</p>
        <div className="yb-groups">
          {groups.map(([g, list]) => (
            <div key={g} className="yb-g">
              <h4>{g}</h4>
              {list.map((s) => <div key={s.id} className="yb-row" title={s.detail}><span>{s.label}</span><b>{s.value}</b></div>)}
            </div>
          ))}
        </div>
      </section>

      <section className="yb-sec">
        <h3>User agent</h3>
        <code className="yb-ua">{profile.ua}</code>
        {profile.uaBrands && <code className="yb-ua">Client hints: {profile.uaBrands}</code>}
      </section>
    </div>
  );
}

export function BrowserLive({ profile, atlas }: { profile: Profile; atlas: Atlas }) {
  const i = useInternals(true);
  const perms = usePermissions();
  const node = (id: string) => atlas.nodes.find((n) => n.i === id);
  void node; void supportOf;
  return (
    <aside className="api yb-live">
      <div className="api-sec">
        <div className="api-h"><span>Under the hood</span><span className="yb-pulse"><i />live</span></div>
        <div className="yb-stats">
          <Stat label="Frame rate" value={i.fps} unit="fps" color={i.fps && i.fps < 30 ? C.warn : undefined} />
          <Stat label="Loop lag" value={i.lag} unit="ms" digits={1} color={i.lag > 50 ? C.warn : undefined} />
          <Stat label="Long tasks" value={i.longTasks} />
          <Stat label="JS heap" value={i.heapMB} unit="MB" digits={1} />
        </div>
        <Spark values={i.fpsH} w={260} h={34} min={0} max={Math.max(60, ...i.fpsH)} />
        <Spark values={i.lagH} w={260} h={34} min={0} color={C.warn} />
      </div>
      <div className="api-sec">
        <div className="api-h"><span>Hardware</span></div>
        <Readout rows={[
          { k: "CPU threads", v: i.cores }, { k: "Device memory", v: i.memGB, u: "GB" },
          { k: "GPU", v: i.gpu?.renderer?.replace(/ANGLE \(|\)/g, "").slice(0, 34) ?? "n/a" }, { k: "WebGL 2", v: i.gpu ? (i.gpu.webgl2 ? "yes" : "no") : "n/a" },
          { k: "Max texture", v: i.gpu?.maxTex ?? "n/a" }, { k: "Battery", v: i.battery ? Math.round(i.battery.level * 100) + "%" + (i.battery.charging ? " charging" : "") : "hidden" },
        ]} />
      </div>
      <div className="api-sec">
        <div className="api-h"><span>Display</span></div>
        <Readout rows={[
          { k: "Viewport", v: `${i.viewport.w} x ${i.viewport.h}` }, { k: "Screen", v: `${i.viewport.sw} x ${i.viewport.sh}` },
          { k: "Pixel ratio", v: i.viewport.dpr }, { k: "Orientation", v: i.viewport.orient },
          { k: "Colour scheme", v: profile.dark ? "dark" : "light" }, { k: "Reduced motion", v: profile.reducedMotion ? "on" : "off" },
        ]} />
      </div>
      <div className="api-sec">
        <div className="api-h"><span>Network and storage</span></div>
        <Readout rows={[
          { k: "Online", v: i.online ? "yes" : "no" }, { k: "Link", v: i.net.type }, { k: "Downlink", v: i.net.down, u: "Mb/s" }, { k: "Round trip", v: i.net.rtt, u: "ms" },
          { k: "Storage used", v: fx(i.storage.usedMB, 1), u: "MB" }, { k: "Storage quota", v: fx(i.storage.quotaMB === null ? null : i.storage.quotaMB / 1024, 1), u: "GB" },
          { k: "Persistent", v: i.storage.persisted === null ? "n/a" : i.storage.persisted ? "yes" : "no" }, { k: "Tab visible", v: i.visible ? "yes" : "no" },
        ]} />
      </div>
      <div className="api-sec">
        <div className="api-h"><span>Page load</span></div>
        <Readout rows={[
          { k: "First byte", v: i.nav.ttfb, u: "ms" }, { k: "DOM ready", v: i.nav.dcl, u: "ms" }, { k: "Loaded", v: i.nav.load, u: "ms" },
          { k: "Transferred", v: i.nav.transfer, u: "KB" }, { k: "Requests", v: i.nav.resources },
        ]} />
      </div>
      <div className="api-sec">
        <div className="api-h"><span>Permission state</span></div>
        <div className="yb-perms">
          {PERMS.map((p) => <div key={p} className={"yb-perm p-" + (perms[p] || "unsupported")}><span>{p}</span><b>{perms[p] || "..."}</b></div>)}
        </div>
      </div>
    </aside>
  );
}
