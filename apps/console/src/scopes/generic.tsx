import type { AtlasNode, ScopeDef } from "../core/types";
import { every, noise } from "../core/harness";
import { realHandlers } from "../real";
import type { RealHandler } from "../real";
import { Frame, Readout, Table, Waiting, lastData } from "../ui/kit";
import { useEffect, useRef } from "react";

// Any atlas attribute with a one-shot real handler but no curated instrument becomes a generic
// scope: Request runs the handler once and shows the fields it returned as a table.

type GenRec = { fields: { name: string; value: unknown; unit?: string }[]; note?: string; ok: boolean };

function Video({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay muted playsInline className="gen-video" />;
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
    Instrument: ({ session }) => {
      const d = lastData<GenRec>(session);
      return (
        <Frame
          visual={d ? (
            <div className="gen">
              {session.media && <Video stream={session.media} />}
              <Table head={["Field", "Value"]} rows={d.fields.map((f) => [f.name, `${typeof f.value === "object" ? JSON.stringify(f.value) : String(f.value)}${f.unit ? " " + f.unit : ""}`])} />
              {d.note && <p className="viz-caption">{d.note}</p>}
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
