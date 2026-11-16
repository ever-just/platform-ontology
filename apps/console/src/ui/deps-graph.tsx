import { memo, useMemo } from "react";
import { AppWindow, Bluetooth, BatteryMedium, Camera, Cpu, Eye, Focus, GitBranch, KeyRound, Lock, Mic, MapPin, MousePointerClick, SlidersHorizontal, Usb, Wifi, Code2 } from "lucide-react";
import type { IconType, ScopeDef } from "../core/types";
import { KINDS, capabilityEdges, reqKey, type DepInfo, type Req, type ReqKind, type ReqStatus } from "../core/deps";
import type { ConsoleCtx } from "../ext/registry";
import { DOMAIN_COLOR } from "./kit";
import { CapIcon } from "./icons";

// The dependency graph: what a capability needs on the left, the capability in the middle, and what
// it unlocks on the right. Colours come from theme variables, so it follows the chosen look.

/** One colour per kind of requirement, drawn from the domain palette. */
export const KIND_COLOR: Record<ReqKind, string> = {
  capability: DOMAIN_COLOR.place,
  permission: DOMAIN_COLOR.fingerprint,
  context: DOMAIN_COLOR.motion,
  hardware: DOMAIN_COLOR.identity,
  api: DOMAIN_COLOR.surroundings,
};

const STATUS_VAR: Record<ReqStatus, string> = { met: "var(--ok)", unmet: "var(--err)", unknown: "var(--mute)" };
const STATUS_WORD: Record<ReqStatus, string> = { met: "met in this browser", unmet: "not met in this browser", unknown: "cannot be checked from here" };

const KIND_ICON: Record<ReqKind, IconType> = { capability: GitBranch, permission: KeyRound, context: SlidersHorizontal, hardware: Cpu, api: Code2 };
const CTX_ICON: Record<string, IconType> = { secure: Lock, gesture: MousePointerClick, toplevel: AppWindow, visible: Eye, focused: Focus, online: Wifi };
const HW_ICON: Record<string, IconType> = { camera: Camera, microphone: Mic, battery: BatteryMedium, bluetooth: Bluetooth, usb: Usb, gps: MapPin };

export function reqIcon(r: Req): IconType {
  if (r.kind === "context") return CTX_ICON[r.id] || KIND_ICON.context;
  if (r.kind === "hardware") return HW_ICON[r.id] || KIND_ICON.hardware;
  return KIND_ICON[r.kind];
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + "..." : s);
const tint = (c: string) => `color-mix(in srgb, ${c} 14%, var(--bg))`;

/** A small badge: how many requirements, how many are unmet here. */
export function DepsBadge({ info }: { info: DepInfo }) {
  const n = info.reqs.length;
  const tone = info.unmet > 0 ? "bad" : info.silent ? "ok" : "mute";
  const text = n === 0 ? "No requirements" : info.silent ? "No prompt needed" : `${n} requirement${n === 1 ? "" : "s"}${info.unmet ? `, ${info.unmet} unmet` : ""}`;
  return (
    <span className={"mode dep-badge t-" + tone} title="What this capability needs before it can work. See the Scope tab.">
      <GitBranch size={12} />{text}
    </span>
  );
}

/** A tiny count for list rows. */
export function DepsCount({ n, title }: { n: number; title?: string }) {
  return <span className="dep-count" title={title || `${n} requirement${n === 1 ? "" : "s"}`}><GitBranch size={11} />{n}</span>;
}

type GNode = { key: string; label: string; title: string; Icon: IconType; color: string; status: ReqStatus | "none"; x: number; y: number; w: number; h: number; scope?: string; center?: boolean };
type GEdge = { from: GNode; to: GNode; status: ReqStatus | "none" };

const W = 360, ROW = 30, NH = 24, PAD = 8, KGAP = 6;

function layout(scope: ScopeDef, info: DepInfo, ctx: ConsoleCtx) {
  const byId = new Map(ctx.scopes.map((s) => [s.id, s]));
  const right = info.unlocks.map((id) => byId.get(id)).filter(Boolean) as ScopeDef[];
  const hasRight = right.length > 0;
  const lw = hasRight ? 112 : 156, cw = hasRight ? 100 : 112, rw = 112;
  const cx = hasRight ? 128 : W - 2 - cw;
  // Left column, with a small extra gap between kinds so each group reads as one.
  let y = PAD, last: ReqKind | "" = "";
  const left: GNode[] = info.reqs.map((r) => {
    if (last && last !== r.kind) y += KGAP;
    last = r.kind;
    const cs = r.kind === "capability" ? byId.get(r.id) : undefined;
    const n: GNode = {
      key: reqKey(r), label: trunc(r.label, Math.floor((lw - 26) / 4.9)), title: `${r.label} (${KINDS.find((k) => k.id === r.kind)!.label}): ${r.why} ${STATUS_WORD[info.status[reqKey(r)] || "unknown"]}.`,
      Icon: reqIcon(r), color: cs ? DOMAIN_COLOR[cs.domain] : KIND_COLOR[r.kind], status: info.status[reqKey(r)] || "unknown", x: 2, y, w: lw, h: NH, scope: cs?.id,
    };
    y += ROW;
    return n;
  });
  const leftH = y + PAD;
  const rightH = right.length * ROW + PAD * 2;
  const H = Math.max(leftH, rightH, 64);
  const mid = H / 2;
  const centre: GNode = { key: "self", label: trunc(scope.name, Math.floor((cw - 26) / 4.9)), title: scope.name, Icon: GitBranch, color: DOMAIN_COLOR[scope.domain], status: "none", x: cx, y: mid - 17, w: cw, h: 34, center: true, scope: scope.id };
  const rightNodes: GNode[] = right.map((s, i) => ({
    key: "u:" + s.id, label: trunc(s.name, Math.floor((rw - 26) / 4.9)), title: `${s.name} needs ${scope.name}. Click to open it.`, Icon: GitBranch,
    color: DOMAIN_COLOR[s.domain], status: "none", x: W - 2 - rw, y: (H - right.length * ROW) / 2 + i * ROW + (ROW - NH) / 2, w: rw, h: NH, scope: s.id,
  }));
  const edges: GEdge[] = [...left.map((n) => ({ from: n, to: centre, status: n.status })), ...rightNodes.map((n) => ({ from: centre, to: n, status: "none" as const }))];
  return { left, centre, rightNodes, edges, H, scopes: byId };
}

const edgePath = (a: GNode, b: GNode) => {
  const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 4, y2 = b.y + b.h / 2, m = (x1 + x2) / 2;
  return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`;
};

function NodeBox({ n, select, byId }: { n: GNode; select: (id: string) => void; byId: Map<string, ScopeDef> }) {
  const st = n.status === "none" ? n.color : STATUS_VAR[n.status];
  const click = n.scope && !n.center ? () => select(n.scope!) : undefined;
  const sc = n.scope ? byId.get(n.scope) : undefined;
  const Ic = n.Icon;
  return (
    <g className={"dg-n" + (click ? " click" : "")} onClick={click} role={click ? "button" : undefined} tabIndex={click ? 0 : undefined}
       onKeyDown={click ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(); } } : undefined}>
      <title>{n.title}</title>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.center ? 9 : 7} style={{ fill: tint(st), stroke: st, strokeWidth: n.center ? 1.6 : 1 }} />
      <g transform={`translate(${n.x + 6} ${n.y + n.h / 2 - 6})`} style={{ color: n.color }}>
        {sc && sc.icon ? <CapIcon scope={sc} size={12} /> : <Ic size={12} strokeWidth={2} />}
      </g>
      <text x={n.x + 22} y={n.y + n.h / 2 + 3.5} className="dg-t">{n.label}</text>
    </g>
  );
}

/** The selected capability in the middle, its requirements to the left, what it unlocks to the right. */
export const DepsGraph = memo(function DepsGraph({ scope, ctx, info }: { scope: ScopeDef; ctx: ConsoleCtx; info: DepInfo }) {
  const g = useMemo(() => layout(scope, info, ctx), [scope, info, ctx]);
  const kinds = KINDS.filter((k) => info.reqs.some((r) => r.kind === k.id));
  return (
    <figure className="dg">
      <svg viewBox={`0 0 ${W} ${g.H}`} role="img" aria-label={`Dependency graph for ${scope.name}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {(["met", "unmet", "unknown", "none"] as const).map((s) => (
            <marker key={s} id={"dg-a-" + s} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" style={{ fill: s === "none" ? "var(--ink2)" : STATUS_VAR[s] }} />
            </marker>
          ))}
        </defs>
        {g.edges.map((e, i) => (
          <path key={i} d={edgePath(e.from, e.to)} className="dg-e" style={{ stroke: e.status === "none" ? "var(--ink2)" : STATUS_VAR[e.status] }} markerEnd={`url(#dg-a-${e.status})`} />
        ))}
        {g.left.map((n) => <NodeBox key={n.key} n={n} select={ctx.select} byId={g.scopes} />)}
        {g.rightNodes.map((n) => <NodeBox key={n.key} n={n} select={ctx.select} byId={g.scopes} />)}
        <NodeBox n={{ ...g.centre, Icon: g.centre.Icon }} select={ctx.select} byId={g.scopes} />
      </svg>
      <figcaption className="dg-lg">
        {kinds.map((k) => { const I = KIND_ICON[k.id]; return <span key={k.id} title={k.plain}><i className="dg-k" style={{ color: KIND_COLOR[k.id] }}><I size={11} /></i>{k.label}</span>; })}
        <span className="dg-s"><i style={{ background: "var(--ok)" }} />met<i style={{ background: "var(--err)" }} />unmet<i style={{ background: "var(--mute)" }} />unknown</span>
      </figcaption>
    </figure>
  );
});

/** Compact list of the same requirements, with the reason for each. */
export function DepsList({ ctx, info }: { ctx: ConsoleCtx; info: DepInfo }) {
  return (
    <ul className="dpl">
      {info.reqs.map((r) => {
        const st = info.status[reqKey(r)] || "unknown";
        const I = reqIcon(r);
        const target = r.kind === "capability" ? ctx.scopes.find((s) => s.id === r.id) : undefined;
        const body = (
          <>
            <span className="dpl-i" style={{ color: KIND_COLOR[r.kind] }}><I size={13} /></span>
            <span className="dpl-b"><b>{r.label}</b><span>{r.why}</span></span>
            <span className={"dpl-s s-" + st} title={STATUS_WORD[st]}>{st}</span>
          </>
        );
        return <li key={reqKey(r)}>{target ? <button className="dpl-r" onClick={() => ctx.select(target.id)}>{body}</button> : <div className="dpl-r">{body}</div>}</li>;
      })}
    </ul>
  );
}

/** The whole "Depends on" section of the Scope tab. */
export function DependsOn({ scope, ctx, info }: { scope: ScopeDef; ctx: ConsoleCtx; info: DepInfo }) {
  return (
    <>
      <p className="dep-lead">
        {info.silent
          ? <><b>Needs nothing from you.</b> No permission, no prompt and no gesture, so any page can use it without you noticing.</>
          : <>{info.reqs.length} thing{info.reqs.length === 1 ? "" : "s"} must be in place{info.unmet ? <>, <b>{info.unmet} not met</b> in this browser</> : null}. Click a capability to open it.</>}
        {info.unlocks.length > 0 && <> {info.unlocks.length === 1 ? "One capability depends on it." : `${info.unlocks.length} capabilities depend on it.`}</>}
      </p>
      <DepsGraph scope={scope} ctx={ctx} info={info} />
      <DepsList ctx={ctx} info={info} />
    </>
  );
}

// Overview ---------------------------------------------------------------------------------------

/** Every capability that depends on another, or is depended on, in layers from left to right. */
export function DepsOverview({ ctx }: { ctx: ConsoleCtx }) {
  const g = useMemo(() => {
    const edges = capabilityEdges(ctx.scopes, ctx.nodeOf);
    const ids = new Set<string>();
    edges.forEach(([a, b]) => { ids.add(a); ids.add(b); });
    const depth = new Map<string, number>();
    const d = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const v = Math.max(-1, ...edges.filter(([, b]) => b === id).map(([a]) => d(a, seen))) + 1;
      depth.set(id, v);
      return v;
    };
    ids.forEach((id) => d(id, new Set()));
    const cols = Math.max(0, ...depth.values()) + 1;
    const byCol: ScopeDef[][] = Array.from({ length: cols }, () => []);
    const byId = new Map(ctx.scopes.map((s) => [s.id, s]));
    [...ids].sort().forEach((id) => { const s = byId.get(id); if (s) byCol[depth.get(id)!].push(s); });
    const w = 640, nw = 150, ROWH = 32;
    const rows = Math.max(1, ...byCol.map((c) => c.length));
    const pos = new Map<string, { x: number; y: number }>();
    byCol.forEach((c, ci) => c.forEach((s, i) => pos.set(s.id, { x: cols === 1 ? 2 : 2 + ci * ((w - nw - 4) / (cols - 1)), y: PAD + i * ROWH + ((rows - c.length) * ROWH) / 2 })));
    return { edges, pos, byId, w, nw, h: rows * ROWH + PAD * 2 };
  }, [ctx.scopes, ctx.nodeOf]);
  if (!g.edges.length) return null;
  return (
    <figure className="dg dg-wide">
      <svg viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-label="How capabilities depend on each other">
        <defs>
          <marker id="dg-ov" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" style={{ fill: "var(--ink2)" }} /></marker>
        </defs>
        {g.edges.map(([a, b], i) => {
          const pa = g.pos.get(a), pb = g.pos.get(b);
          if (!pa || !pb) return null;
          const x1 = pa.x + g.nw, y1 = pa.y + NH / 2, x2 = pb.x - 4, y2 = pb.y + NH / 2, m = (x1 + x2) / 2;
          return <path key={i} d={`M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`} className="dg-e" style={{ stroke: "var(--ink2)" }} markerEnd="url(#dg-ov)" />;
        })}
        {[...g.pos.entries()].map(([id, p]) => {
          const s = g.byId.get(id)!;
          const c = DOMAIN_COLOR[s.domain];
          return <NodeBox key={id} select={ctx.select} byId={g.byId} n={{ key: id, label: trunc(s.name, 22), title: `${s.name}. Click to open it.`, Icon: GitBranch, color: c, status: "none", x: p.x, y: p.y, w: g.nw, h: NH, scope: id }} />;
        })}
      </svg>
      <figcaption className="dg-lg"><span>Arrows run from what is needed to what needs it.</span></figcaption>
    </figure>
  );
}
