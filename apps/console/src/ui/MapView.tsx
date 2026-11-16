import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import type { Atlas, AtlasNode, DomainId, ScopeDef } from "../core/types";
import { getSession, isActive, useVersion } from "../core/harness";
import { DOMAIN_COLOR } from "./kit";

// Every attribute in the atlas as one graph. Nodes cluster by relationship domain; edges are
// "related" links from the atlas, shared permissions, and the scope-level "feeds" inferences.

type N = SimulationNodeDatum & { id: string; node?: AtlasNode; scope?: ScopeDef; d: DomainId; r: number; label: string };
type L = SimulationLinkDatum<N> & { t: "r" | "p" | "f" };

export function MapView({ atlas, scopes, selected, onSelect }: { atlas: Atlas; scopes: ScopeDef[]; selected: string; onSelect: (id: string) => void }) {
  useVersion();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<N | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [filter, setFilter] = useState<DomainId | "">("");
  const view = useRef({ k: 1, x: 0, y: 0 });

  const graph = useMemo(() => {
    const scopeOf = new Map<string, ScopeDef>();
    scopes.forEach((s) => s.atlas.forEach((a) => !scopeOf.has(a) && scopeOf.set(a, s)));
    const nodes: N[] = atlas.nodes.map((n) => {
      const s = scopeOf.get(n.i);
      return { id: n.i, node: n, scope: s, d: n.d, r: s ? 6 : 2.6 + Math.min(2, (n.fb || 0) / 6), label: s ? s.name : n.n };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links: L[] = atlas.edges.filter(([a, b]) => byId.has(a) && byId.has(b)).map(([a, b, t]) => ({ source: a, target: b, t }));
    const primary = new Map(scopes.map((s) => [s.id, s.atlas.find((a) => byId.has(a))]));
    scopes.forEach((s) => (s.feeds || []).forEach((f) => {
      const a = primary.get(s.id);
      const b = primary.get(f);
      if (a && b && a !== b) links.push({ source: a, target: b, t: "f" });
    }));
    return { nodes, links, byId };
  }, [atlas, scopes]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const centers = useMemo(() => {
    const ids = atlas.domains.map((d) => d.id as DomainId);
    const R = Math.min(size.w, size.h) * 0.3;
    return Object.fromEntries(ids.map((id, i) => {
      const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: Math.cos(a) * R * (size.w > size.h ? 1.12 : 1), y: Math.sin(a) * R }];
    })) as Record<DomainId, { x: number; y: number }>;
  }, [atlas, size]);

  useEffect(() => {
    const { nodes, links } = graph;
    const sim = forceSimulation<N>(nodes)
      .force("link", forceLink<N, L>(links).id((n) => n.id).distance((l) => (l.t === "f" ? 90 : 26)).strength((l) => (l.t === "f" ? 0.01 : (l.source as N).d === (l.target as N).d ? 0.14 : 0.006)))
      .force("charge", forceManyBody<N>().strength((n) => (n.scope ? -60 : -9)))
      .force("x", forceX<N>((n) => centers[n.d].x).strength(0.2))
      .force("y", forceY<N>((n) => centers[n.d].y).strength(0.2))
      .force("collide", forceCollide<N>((n) => n.r + 1.5))
      .alphaDecay(0.03);
    sim.on("tick", draw);
    return () => void sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, centers]);

  useEffect(draw);

  function draw() {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== size.w * dpr) { c.width = size.w * dpr; c.height = size.h * dpr; }
    const g = c.getContext("2d")!;
    const { k, x, y } = view.current;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    g.translate(size.w / 2 + x, size.h / 2 + y);
    g.scale(k, k);
    const sel = scopes.find((s) => s.id === selected);
    const focus = hover?.id || (sel ? sel.atlas.find((a) => graph.byId.has(a)) : undefined);
    const near = new Set<string>();
    if (focus) {
      near.add(focus);
      graph.links.forEach((l) => {
        const a = (l.source as N).id, b = (l.target as N).id;
        if (a === focus) near.add(b);
        if (b === focus) near.add(a);
      });
    }
    // domain labels
    g.font = "600 11px Geist, system-ui, sans-serif";
    g.textAlign = "center";
    atlas.domains.forEach((d) => {
      const p = centers[d.id as DomainId];
      g.fillStyle = filter && filter !== d.id ? "#d4d4d8" : DOMAIN_COLOR[d.id as DomainId];
      const lx = Math.max(-size.w / 2 + 80, Math.min(size.w / 2 - 80, p.x * 1.3));
      const ly = Math.max(-size.h / 2 + 46, Math.min(size.h / 2 - 34, p.y * 1.3 + 4));
      g.fillText(d.name.toUpperCase(), lx, ly);
    });
    graph.links.forEach((l) => {
      const a = l.source as N, b = l.target as N;
      if (a.x == null || b.x == null) return;
      const hot = focus && (near.has(a.id) && near.has(b.id)) && (a.id === focus || b.id === focus);
      g.strokeStyle = hot ? (l.t === "f" ? "#0b0b0c" : DOMAIN_COLOR[a.d]) : l.t === "f" ? "rgba(11,11,12,0.12)" : "rgba(11,11,12,0.06)";
      g.lineWidth = (hot ? 1.2 : 0.6) / k;
      g.setLineDash(l.t === "f" ? [3 / k, 3 / k] : l.t === "p" ? [1 / k, 2 / k] : []);
      g.beginPath();
      g.moveTo(a.x, a.y!);
      g.lineTo(b.x, b.y!);
      g.stroke();
    });
    g.setLineDash([]);
    const t = performance.now();
    graph.nodes.forEach((n) => {
      if (n.x == null) return;
      const dim = (focus && !near.has(n.id)) || (filter && filter !== n.d);
      const live = n.scope && isActive(getSession(n.scope.id));
      if (live) {
        const pr = n.r + 4 + ((t / 60) % 10);
        g.beginPath();
        g.arc(n.x, n.y!, pr, 0, Math.PI * 2);
        g.strokeStyle = DOMAIN_COLOR[n.d];
        g.globalAlpha = Math.max(0, 1 - ((t / 60) % 10) / 10);
        g.lineWidth = 1 / k;
        g.stroke();
        g.globalAlpha = 1;
      }
      g.beginPath();
      g.arc(n.x, n.y!, n.r, 0, Math.PI * 2);
      g.fillStyle = DOMAIN_COLOR[n.d];
      g.globalAlpha = dim ? 0.15 : n.scope ? 1 : 0.55;
      g.fill();
      if (n.scope) {
        g.lineWidth = 1.5 / k;
        g.strokeStyle = n.scope.id === selected ? "#0b0b0c" : "#fff";
        g.stroke();
      }
      g.globalAlpha = 1;
    });
    g.font = `500 ${10.5 / Math.max(0.8, k)}px Geist, system-ui, sans-serif`;
    g.textAlign = "left";
    graph.nodes.forEach((n) => {
      if (n.x == null) return;
      const show = (n.scope && (!focus || near.has(n.id)) && !(filter && filter !== n.d)) || n.id === focus || (focus && near.has(n.id) && k > 1.2);
      if (!show) return;
      g.fillStyle = "rgba(255,255,255,0.85)";
      const w = g.measureText(n.label).width;
      g.fillRect(n.x + n.r + 2, n.y! - 6, w + 4, 12);
      g.fillStyle = n.id === focus ? "#0b0b0c" : "#4a4a50";
      g.fillText(n.label, n.x + n.r + 4, n.y! + 3.5);
    });
  }

  // keep pulses animating while anything streams
  useEffect(() => {
    let h = 0;
    const loop = () => { draw(); h = requestAnimationFrame(loop); };
    h = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(h);
  });

  function pick(e: React.PointerEvent): N | null {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const { k, x, y } = view.current;
    const px = (e.clientX - r.left - size.w / 2 - x) / k;
    const py = (e.clientY - r.top - size.h / 2 - y) / k;
    let best: N | null = null;
    let bd = 14 / k;
    graph.nodes.forEach((n) => {
      if (n.x == null) return;
      const d = Math.hypot(n.x - px, n.y! - py) - n.r;
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }

  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  return (
    <div className="map" ref={wrap}>
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, vx: view.current.x, vy: view.current.y, moved: false }; (e.target as Element).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
            if (d.moved) { view.current.x = d.vx + e.clientX - d.x; view.current.y = d.vy + e.clientY - d.y; return; }
          }
          setHover(pick(e));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const n = pick(e);
            if (n?.scope) onSelect(n.scope.id);
            else setHover(n);
          }
        }}
        onPointerLeave={() => { if (!drag.current) setHover(null); }}
        onWheel={(e) => { const k = view.current.k * (e.deltaY < 0 ? 1.1 : 0.9); view.current.k = Math.max(0.4, Math.min(4, k)); }}
      />
      <div className="map-legend">
        {atlas.domains.map((d) => (
          <button key={d.id} className={filter === d.id ? "on" : ""} onClick={() => setFilter(filter === d.id ? "" : (d.id as DomainId))}>
            <i style={{ background: DOMAIN_COLOR[d.id as DomainId] }} />{d.short} <em>{d.count}</em>
          </button>
        ))}
      </div>
      <div className="map-key">
        <span><i className="k-big" />scope you can request</span>
        <span><i className="k-dot" />attribute</span>
        <span><i className="k-line" />related</span>
        <span><i className="k-dash" />combines into an inference</span>
      </div>
      {hover && hover.node && (
        <div className="map-card">
          <div className="card-h"><b>{hover.node.n}</b><span style={{ color: DOMAIN_COLOR[hover.d] }}>{atlas.domains.find((d) => d.id === hover.d)?.short}</span></div>
          <p>{hover.node.p || hover.node.m}</p>
          <div className="map-card-meta">
            <span>{hover.node.perm ? `permission: ${hover.node.perm}` : "no permission"}</span>
            {hover.node.fb ? <span>{hover.node.fb} bits</span> : null}
            {hover.scope && <button className="lnk" onClick={() => onSelect(hover.scope!.id)}>Open scope</button>}
          </div>
        </div>
      )}
    </div>
  );
}
