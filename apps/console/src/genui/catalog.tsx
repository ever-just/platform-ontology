import type { ReactNode } from "react";
import { z } from "zod";
import { Catalog, CommonSchemas } from "@a2ui/web_core/v0_9";
import { createComponentImplementation } from "@a2ui/react/v0_9";
import { series, useSession } from "../core/harness";
import { primaryMetric } from "../core/datatype";
import { Spark, Stat } from "../ui/kit";
import { BarList } from "../ui/charts";

// The "po" catalog: the only components the voice AI may put in the chat. Each one wraps a piece of
// the console's own UI kit. The AI sends A2UI JSON that names these components; it can never send
// code, markup or styles, and anything outside this list is rejected by the message processor.

export const PO_CATALOG_ID = "https://platformontology.lol/a2ui/po/v1";

import { scopeFor } from "./scopes";

type Kid = string | { id?: string; componentId?: string; basePath?: string; dataPath?: string };
function kids(list: unknown, build: (id: string, base?: string) => ReactNode) {
  return (Array.isArray(list) ? (list as Kid[]) : []).map((c, i) => {
    if (typeof c === "string") return <span key={c + i} className="gu-k">{build(c)}</span>;
    const id = c.id || c.componentId || "";
    return <span key={id + i} className="gu-k">{build(id, c.basePath)}</span>;
  });
}

const S = CommonSchemas;
const ColumnApi = { name: "Column", schema: z.object({ children: S.ChildList }) };
const RowApi = { name: "Row", schema: z.object({ children: S.ChildList }) };
const CardApi = { name: "Card", schema: z.object({ title: S.DynamicString.optional(), children: S.ChildList.optional() }) };
const TextApi = { name: "Text", schema: z.object({ text: S.DynamicString, tone: z.enum(["plain", "muted", "good", "bad"]).optional() }) };
const StatApi = { name: "Stat", schema: z.object({ label: S.DynamicString, value: S.DynamicString, unit: S.DynamicString.optional() }) };
const ReadingApi = { name: "Reading", schema: z.object({ capability: z.string(), title: S.DynamicString.optional() }) };
const BarsApi = { name: "Bars", schema: z.object({ items: z.array(z.object({ label: z.string(), value: z.number() })).max(24) }) };
const FieldApi = { name: "Field", schema: z.object({ label: S.DynamicString, value: S.DynamicString, placeholder: z.string().optional() }) };
const ButtonApi = { name: "Button", schema: z.object({ label: S.DynamicString, action: S.Action, primary: z.boolean().optional() }) };

const Column = createComponentImplementation(ColumnApi, ({ props, buildChild }) => <div className="gu-col">{kids(props.children, buildChild)}</div>);
const Row = createComponentImplementation(RowApi, ({ props, buildChild }) => <div className="gu-row">{kids(props.children, buildChild)}</div>);
const Card = createComponentImplementation(CardApi, ({ props, buildChild }) => (
  <section className="gu-card">
    {props.title ? <h4>{props.title}</h4> : null}
    <div className="gu-col">{kids(props.children, buildChild)}</div>
  </section>
));
const Text = createComponentImplementation(TextApi, ({ props }) => <p className={"gu-text " + (props.tone || "plain")}>{props.text}</p>);
const StatTile = createComponentImplementation(StatApi, ({ props }) => (
  <div className="gu-stat"><Stat label={String(props.label ?? "")} value={props.value} unit={props.unit || undefined} /></div>
));

/** A live reading: reads the capability's own session in this tab, so the AI never streams numbers. */
function LiveReading({ capability, title }: { capability: string; title?: string }) {
  const scope = scopeFor(capability);
  const ses = useSession(scope ? scope.id : capability);
  if (!scope) return <p className="gu-text bad">No capability {capability}</p>;
  const m = primaryMetric(scope);
  const last = ses.last?.data as Record<string, unknown> | undefined;
  const v = m && last ? last[m.key] : undefined;
  const values = m ? series(ses.records, m.key, 60) : [];
  return (
    <div className="gu-reading">
      <Stat label={title || (m ? `${scope.name}: ${m.label}` : scope.name)} value={v ?? (ses.count ? "on" : "off")} unit={m?.unit} digits={m?.digits} />
      {values.length > 1 ? <Spark values={values} w={220} h={34} /> : <small className="gu-mute">{ses.count ? `${ses.count} readings` : "Not running yet"}</small>}
    </div>
  );
}
const Reading = createComponentImplementation(ReadingApi, ({ props }) => <LiveReading capability={String(props.capability)} title={props.title || undefined} />);
const Bars = createComponentImplementation(BarsApi, ({ props }) => (
  <BarList rows={(props.items || []).map((x, i) => ({ key: String(i), label: x.label, value: x.value }))} />
));
const Field = createComponentImplementation(FieldApi, ({ props }) => {
  const p = props as typeof props & { setValue?: (v: string) => void };
  return (
    <label className="gu-field"><span>{props.label}</span>
      <input value={String(props.value ?? "")} placeholder={props.placeholder} onChange={(e) => p.setValue?.(e.target.value)} />
    </label>
  );
});
const Button = createComponentImplementation(ButtonApi, ({ props }) => (
  <button type="button" className={"gu-btn" + (props.primary ? " primary" : "")} onClick={() => props.action?.()}>{props.label}</button>
));

export const PO_COMPONENTS = ["Column", "Row", "Card", "Text", "Stat", "Reading", "Bars", "Field", "Button"] as const;

export const poCatalog = new Catalog(PO_CATALOG_ID, "v0.9", [Column, Row, Card, Text, StatTile, Reading, Bars, Field, Button]);
