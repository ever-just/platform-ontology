import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import type { AtlasNode, ScopeDef } from "../core/types";
import { detectProfile } from "../browser/profile";
import { probe, RELEASE_LABEL, type Availability } from "../browser/availability";
import { Frame, Readout } from "../ui/kit";
import "./reference.css";

// Every atlas entry that no live scope covers still appears, as a reference card: what it is, the
// API, the permission, support per browser, and an availability probe for this browser. Running it
// only checks; it never asks for anything.

export const BROWSERS = ["Chrome", "Edge", "Firefox", "Safari", "iOS Safari", "Chrome Android", "Samsung"];
const SUP: Record<string, [string, string]> = { y: ["Yes", "ok"], p: ["Partly", "warn"], f: ["Flag", "warn"], r: ["Restricted", "warn"], n: ["No", "no"], u: ["Unknown", "no"] };

let profileCache: ReturnType<typeof detectProfile> | null = null;
const prof = () => (profileCache ??= detectProfile());

export function AvailabilityBadge({ a }: { a: Availability | null }) {
  if (!a) return <span className="ref-badge">checking</span>;
  const tone = a.release === "not-exposed" ? "no" : a.detect === "present" ? (a.permission === "denied" ? "err" : "ok") : a.detect === "absent" ? "no" : "warn";
  const text = a.release === "not-exposed" ? "never exposed" : a.detect === "present" ? (a.permission === "denied" ? "blocked" : "available") : a.detect === "absent" ? "missing" : "no script test";
  return <span className={"ref-badge t-" + tone}>{text}</span>;
}

export function useAvailability(node: AtlasNode | undefined): Availability | null {
  const [a, setA] = useState<Availability | null>(null);
  useEffect(() => {
    let off = false;
    if (node) probe(node, prof()).then((r) => { if (!off) setA(r); });
    return () => { off = true; };
  }, [node]);
  return a;
}

function ReferenceCard({ node }: { node: AtlasNode }) {
  const a = useAvailability(node);
  const me = prof().column;
  return (
    <div className="ref">
      <div className="ref-head">
        <span className="ref-tag"><BookOpen size={13} />Reference</span>
        <AvailabilityBadge a={a} />
        {a && <span className="ref-rel">{RELEASE_LABEL[a.release]}</span>}
      </div>
      <p className="ref-p">{node.p}</p>
      {node.m && node.m !== node.p && <p className="ref-m">{node.m}</p>}
      {a && <p className="ref-verdict"><b>Here:</b> {a.verdict}</p>}
      {a?.why && <p className="ref-why"><b>Why it is not a live call:</b> {a.why}</p>}
      {node.api && <div className="ref-api"><span>API</span><code>{node.api}</code></div>}
      <div className="ref-sup">
        {BROWSERS.map((b, i) => {
          const [t, c] = SUP[node.sup[i] || "u"] || SUP.u;
          return <div key={b} className={"ref-cell t-" + c + (i === me ? " me" : "")} title={i === me ? "Your browser" : undefined}><span>{b}</span><b>{t}</b></div>;
        })}
      </div>
    </div>
  );
}

export function referenceScope(node: AtlasNode, id: string): ScopeDef {
  return {
    id,
    name: node.n,
    domain: node.d,
    atlas: [node.i],
    summary: node.p || node.m.slice(0, 140),
    call: node.api ? node.api.split(/[;\n]/)[0].slice(0, 90) : "no script API",
    permission: node.perm ? node.perm.split(/[ ,;(]/)[0] : undefined,
    reference: true,
    icon: BookOpen,
    modes: { detect: "Checks whether this browser has it. Nothing is requested." },
    layer: 1,
    reveals: [node.p || node.n].filter(Boolean),
    metrics: [],
    live: async (ctx) => {
      const a = await probe(node, prof());
      ctx.granted();
      ctx.emit({ detect: a.detect, via: a.via, permission: a.permission, release: RELEASE_LABEL[a.release], verdict: a.verdict });
    },
    sim: (ctx) => {
      ctx.granted();
      ctx.emit({ detect: "simulated", verdict: "Reference entry, nothing to simulate." });
      return () => {};
    },
    Instrument: ({ session }) => {
      const d = session.last?.data as Record<string, string> | undefined;
      return (
        <Frame
          visual={<ReferenceCard node={node} />}
          side={<Readout rows={[
            { k: "Detected", v: d?.detect ?? "run to check", hot: true },
            { k: "Checked", v: d?.via ?? null },
            { k: "Permission", v: d?.permission ?? (node.perm || "none") },
            { k: "Grant", v: node.gr || "none" },
            { k: "Remembered", v: node.ps || "n/a" },
            { k: "Revoke", v: node.rv || "n/a" },
          ]} />}
        />
      );
    },
  };
}

/** One reference scope for each atlas node that no other scope exposes. */
export function referenceScopes(existing: ScopeDef[], nodes: AtlasNode[]): ScopeDef[] {
  const covered = new Set(existing.flatMap((s) => s.atlas));
  const taken = new Set(existing.map((s) => s.id));
  const out: ScopeDef[] = [];
  for (const node of nodes) {
    if (covered.has(node.i)) continue;
    let id = `${node.d}.${node.i.split(".").pop()}`;
    if (taken.has(id)) id = `ref.${node.i.replace(/^web\./, "")}`;
    taken.add(id);
    out.push(referenceScope(node, id));
  }
  return out;
}
