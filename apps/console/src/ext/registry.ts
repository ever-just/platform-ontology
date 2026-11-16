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
};

export type Metric = { value: string; unit?: string; sub?: string; tone?: "ok" | "warn" | "err" | "accent" };

export type ViewDef = {
  id: string;
  label: string;
  order: number;
  metric: (ctx: ConsoleCtx) => Metric;
  Panel: ComponentType<{ ctx: ConsoleCtx }>;
};

const groups = new Map<string, GroupDef>();
const views = new Map<string, ViewDef>();
const extraScopes: ScopeDef[] = [];
const subs = new Set<() => void>();
const bump = () => subs.forEach((f) => f());

export function defineGroup(g: GroupDef) { groups.set(g.id, g); bump(); }
export function registerView(v: ViewDef) { views.set(v.id, v); bump(); }
export function registerScopes(list: ScopeDef[]) { extraScopes.push(...list); bump(); }
export function onRegistryChange(f: () => void) { subs.add(f); return () => subs.delete(f); }

export const listGroups = () => [...groups.values()].sort((a, b) => a.order - b.order);
export const listViews = () => [...views.values()].sort((a, b) => a.order - b.order);
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
