import type { ComponentType } from "react";
import type { Atlas, AtlasNode, ScopeDef } from "../core/types";
import type { Profile } from "../browser/profile";
import type { PassiveSignal } from "../real/types";

// Extension points. Built in groups, views and scopes register through the same calls a plugin uses.

export type GroupDef = {
  id: string;
  label: string;
  blurb: string;
  order: number;
  /** Icon shown on the group chip and section header. */
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Curated scope ids placed here, matched exactly. */
  ids?: string[];
  /** Atlas group values (node.g) placed here, for generated scopes. */
  atlasGroups?: string[];
  /** Custom matcher, checked after ids and before atlasGroups. */
  match?: (scope: ScopeDef, node?: AtlasNode) => boolean;
};

export type ConsoleCtx = {
  atlas: Atlas;
  scopes: ScopeDef[];
  profile: Profile;
  passive: PassiveSignal[] | null;
  groups: GroupDef[];
  groupOf: (scopeId: string) => GroupDef;
  groupOfNode: (node: AtlasNode) => GroupDef;
  nodeOf: (scope: ScopeDef) => AtlasNode | undefined;
  select: (scopeId: string) => void;
  range: number;
  /** Chart choices the viewer made in the overview header. Plugin panels should honor them. */
  chart: ChartOpts;
};

export type ChartType = "auto" | "line" | "area" | "bars";
export type Grouping = "auto" | "group" | "capability" | "access";
export type Density = "comfortable" | "compact";
export type ChartOpts = { type: ChartType; by: Grouping; density: Density };

export type Metric = { value: string; unit?: string; sub?: string; tone?: "ok" | "warn" | "err" | "accent"; /** Recent values, oldest first, drawn as a small trend. */ spark?: number[]; /** Change over the spark window. */ delta?: number };

export type ViewDef = {
  id: string;
  label: string;
  order: number;
  metric: (ctx: ConsoleCtx) => Metric;
  Panel: ComponentType<{ ctx: ConsoleCtx }>;
};

/** One capability inside a linked view, with the reading key drawn as its small trend. */
export type LinkPart = { id: string; key?: string; label?: string; /** What the viewer does for the first reading to arrive, if anything. */ hint?: string };
/** What two or more joined readings say together. Return null until there is enough to say. */
export type Inference = { headline: string; detail?: string; tone?: "ok" | "warn" | "err" | "accent" };
/** A layer 3 view: capabilities from different groups read together, with one action to run them all. */
export type LinkDef = {
  id: string;
  title: string;
  /** Plain words: what joining these reveals that each one alone does not. */
  plain: string;
  order: number;
  parts: LinkPart[];
  /** data: latest reading per part. records: every kept reading per part, oldest first, each with its time as _t. */
  infer: (data: Record<string, Record<string, any> | undefined>, records: Record<string, Record<string, any>[]>) => Inference | null;
};

const groups = new Map<string, GroupDef>();
const links = new Map<string, LinkDef>();
const views = new Map<string, ViewDef>();
const extraScopes: ScopeDef[] = [];
const subs = new Set<() => void>();
const bump = () => subs.forEach((f) => f());

export function defineGroup(g: GroupDef) { groups.set(g.id, g); bump(); }
export function registerView(v: ViewDef) { views.set(v.id, v); bump(); }
export function registerScopes(list: ScopeDef[]) { extraScopes.push(...list); bump(); }
export function registerLink(l: LinkDef) { links.set(l.id, l); bump(); }
export function onRegistryChange(f: () => void) { subs.add(f); return () => subs.delete(f); }

export const listGroups = () => [...groups.values()].sort((a, b) => a.order - b.order);
export const listViews = () => [...views.values()].sort((a, b) => a.order - b.order);
export const listLinks = () => [...links.values()].sort((a, b) => a.order - b.order);
export const pluginScopes = () => extraScopes;

export const OTHER: GroupDef = { id: "other", label: "Other", blurb: "Not yet grouped", order: 999 };

/** Resolve a scope to its group: exact id, then custom matcher, then atlas group. */
export function resolveGroup(scope: ScopeDef, node: AtlasNode | undefined, list = listGroups()): GroupDef {
  return (
    list.find((g) => g.ids?.includes(scope.id)) ||
    list.find((g) => g.match?.(scope, node)) ||
    (node && list.find((g) => g.atlasGroups?.includes(node.g))) ||
    OTHER
  );
}
