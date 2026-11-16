import type { AtlasNode, ScopeDef } from "../core/types";
import { every, noise } from "../core/harness";
import { realHandlers } from "../real";
import type { RealHandler } from "../real";
import { Frame, Readout, Spark, Waiting, lastData } from "../ui/kit";
import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import "./generic.css";

// Any atlas attribute with a one-shot real handler but no curated instrument becomes a generic
// scope: Request runs the handler once and shows the fields it returned as a table.

type GenRec = { fields: { name: string; value: unknown; unit?: string }[]; note?: string; ok: boolean };

function Video({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="gen-video" />;
}

type GenField = GenRec["fields"][number];

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const URL_RE = /^https?:\/\/\S+$/i;

function isObj(v: unknown): v is object { return v !== null && typeof v === "object"; }

function FieldCard({ f, mean, history }: { f: GenField; mean?: string; history: number[] }) {
  const v = f.value;
  let body: React.ReactNode;
  let wide = false;
  if (typeof v === "number") {
    const txt = !isFinite(v) ? "n/a" : Number.isInteger(v) ? v.toLocaleString() : Math.abs(v) >= 1000 ? v.toFixed(0) : String(Number(v.toPrecision(5)));
    body = (
      <>
        <div className="gen-num"><b title={String(v)}>{txt}</b>{f.unit && <span>{f.unit}</span>}</div>
        <Spark values={history} h={28} />
      </>
    );
  } else if (typeof v === "boolean") {
    body = <span className={"gen-pill " + (v ? "on" : "off")}>{v ? <Check size={13} strokeWidth={2.4} /> : <X size={13} strokeWidth={2.4} />}{v ? "On" : "Off"}</span>;
  } else if (Array.isArray(v) || isObj(v)) {
    const json = JSON.stringify(v, null, 2) ?? "";
    if (Array.isArray(v)) {
      body = (
        <>
          <div className="gen-count">{v.length}<span>{v.length === 1 ? "item" : "items"}</span></div>
          {v.length > 0 && <details><summary>Details</summary><pre>{json}</pre></details>}
        </>
      );
    } else {
      const keys = Object.keys(v);
      wide = keys.length > 6;
      body = (
        <>
          <div className="gen-keys">{keys.slice(0, 8).map((k) => <code key={k}>{k}</code>)}{keys.length > 8 && <code>+{keys.length - 8}</code>}</div>
          {keys.length > 0 && <details><summary>Details</summary><pre>{json}</pre></details>}
        </>
      );
    }
  } else if (v === null || v === undefined || v === "") {
    body = <div className="gen-str empty">n/a</div>;
  } else {
    const str = String(v);
    if (HEX.test(str)) body = <div className="gen-swatch"><i style={{ background: str }} /><code>{str}</code></div>;
    else if (URL_RE.test(str)) body = <div className="gen-str" title={str}><a href={str} target="_blank" rel="noreferrer noopener">{str.replace(/^https?:\/\//i, "")}</a></div>;
    else body = <div className="gen-str" title={str}>{str}</div>;
    if (str.length > 40) wide = true;
  }
  return (
    <div className={"gen-card" + (wide ? " gen-card-wide" : "")}>
      <div className="gen-label" title={f.name}>{f.name}</div>
      {body}
      {mean && <p className="gen-mean">{mean}</p>}
    </div>
  );
}

export function genericScope(h: RealHandler, node: AtlasNode): ScopeDef {
  return {
    id: `${node.d}.${node.i.split(".").pop()}`,
    name: h.label,
    domain: node.d,
    atlas: [node.i],
    summary: node.p || node.m.slice(0, 140),
    call: node.api ? node.api.split(/[;\n]/)[0].slice(0, 90) : h.label,
    permission: node.perm ? node.perm.split(/[ ,;(]/)[0] : undefined,
    gesture: h.needsGesture,
    passive: node.gr === "none" || !node.perm,
    reveals: [node.p || h.label].filter(Boolean),
    metrics: [{ key: "n", label: "fields" }],
    live: async (ctx) => {
      const r = await h.run();
      if (!r.ok) {
        const e = new Error(r.error || "failed");
        e.name = /does not offer|not support/i.test(r.error || "") ? "NotSupportedError" : /said no|declined|blocked/i.test(r.error || "") ? "NotAllowedError" : "Error";
        throw e;
      }
      ctx.granted();
      if (r.media) ctx.setMedia(r.media);
      ctx.emit({ fields: r.fields, note: r.note, ok: true, n: r.fields.length });
      return () => { try { h.stop?.(); } catch { /* ignore */ } };
    },
    sim: (ctx) => {
      ctx.granted();
      const fields = (node.f || []).map((f) => ({ name: f.n, value: f.t === "number" || f.t === "integer" ? Math.round(50 + noise(40)) : f.t === "boolean" ? true : "sample", unit: f.u || undefined }));
      return every(2000, () => ctx.emit({ fields: fields.length ? fields : [{ name: "status", value: "granted" }], ok: true, n: fields.length, note: "Simulated values shaped like the real fields." }));
    },
    Instrument: ({ scope, session }) => {
      const d = lastData<GenRec>(session);
      const Icon = scope.icon;
      const meanOf = new Map((node.f || []).map((f) => [f.n, ((f as { d?: string; desc?: string }).d || (f as { desc?: string }).desc || "").trim()]));
      const recent = session.records.slice(-60);
      return (
        <Frame
          visual={d ? (
            <div className="gen">
              <div className="gen-head">
                {Icon && <span className="gen-head-ic"><Icon size={26} strokeWidth={1.6} /></span>}
                <div className="gen-head-body">
                  {d.note && <p className="viz-caption">{d.note}</p>}
                  <span className="gen-head-count">{d.fields.length} {d.fields.length === 1 ? "field" : "fields"} returned</span>
                </div>
              </div>
              {session.media && <Video stream={session.media} />}
              <div className="gen-grid">
                {d.fields.map((f) => {
                  const history = typeof f.value === "number"
                    ? recent.map((r) => (r.data as GenRec).fields?.find((x) => x.name === f.name)?.value).filter((x): x is number => typeof x === "number" && isFinite(x))
                    : [];
                  return <FieldCard key={f.name} f={f} mean={meanOf.get(f.name) || undefined} history={history} />;
                })}
              </div>
            </div>
          ) : <Waiting session={session} what={node.p || ""} />}
          side={<Readout rows={[{ k: "Fields returned", v: d?.fields.length ?? null, hot: true }, { k: "Grant", v: node.gr || "none" }, { k: "Remembered", v: node.ps || "n/a" }, { k: "Revoke", v: node.rv || "n/a" }]} />}
        />
      );
    },
  };
}

/** Build generic scopes for handlers not already covered by a curated scope. */
export function genericScopes(curated: ScopeDef[], nodes: AtlasNode[]): ScopeDef[] {
  const covered = new Set(curated.flatMap((s) => s.atlas));
  const byId = new Map(nodes.map((n) => [n.i, n]));
  const seen = new Set<string>();
  const taken = new Set(curated.map((s) => s.id));
  const out: ScopeDef[] = [];
  for (const [id, h] of Object.entries(realHandlers)) {
    if (seen.has(h.label) || covered.has(id)) continue;
    seen.add(h.label);
    const node = byId.get(id);
    if (!node) continue;
    const s = genericScope(h, node);
    if (taken.has(s.id)) continue;
    taken.add(s.id);
    out.push(s);
  }
  return out;
}
