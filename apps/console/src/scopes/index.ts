import type { AtlasNode, ScopeDef } from "../core/types";
import { surroundingsScopes } from "./surroundings";
import { placeScopes } from "./place";
import { motionScopes } from "./motion";
import { linkScopes } from "./link";
import { captureScopes } from "./capture";
import { deviceScopes } from "./device";
import { fingerprintScopes } from "./fingerprint";
import { identityScopes } from "./identity";
import { reachScopes } from "./reach";
import { extrasScopes } from "./extras";
import { genericScopes } from "./generic";
import { pageControlScopes } from "./page-controls";
import { manifestScriptScopes } from "./manifest-scripts";

export const curatedScopes: ScopeDef[] = [
  ...placeScopes, ...motionScopes, ...surroundingsScopes, ...extrasScopes, ...captureScopes,
  ...deviceScopes, ...fingerprintScopes, ...linkScopes, ...identityScopes, ...reachScopes,
  ...pageControlScopes, ...manifestScriptScopes,
];

export function buildScopes(nodes: AtlasNode[]): ScopeDef[] {
  return [...curatedScopes, ...genericScopes(curatedScopes, nodes)];
}
