import type { ScopeDef } from "../core/types";

// The capabilities a "reading" card can show. Kept apart from the catalog so the agent tools can
// set it without loading the A2UI renderer (which needs a DOM).
let scopeList: ScopeDef[] = [];
export function setCatalogScopes(list: ScopeDef[]) { scopeList = list; }
export const scopeFor = (id: string) => scopeList.find((s) => s.id === id || s.atlas.includes(id));
