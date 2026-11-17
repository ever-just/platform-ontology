import type { Atlas, ScopeDef } from "../core/types";
import { registerScopes } from "../core/harness";
import { buildScopes } from "../scopes";
import { referenceScopes } from "../scopes/reference";
import { applyMeta } from "../scopes/meta";
import { pluginScopes } from "../ext/registry";
import { createAgentTools } from "./tools";
import { createMcpServer } from "./mcp";

export { createAgentTools, kindOf, clip } from "./tools";
export type { AgentTools, ToolDef, ToolResult } from "./tools";
export { createMcpServer, PROTOCOL } from "./mcp";
export type { RpcRequest, RpcResponse } from "./mcp";
export { ACTIONS } from "./actions";

/** The same capability list the console builds, for pages that host the agent without the console UI. */
export function consoleScopes(atlas: Atlas): ScopeDef[] {
  const base = [...buildScopes(atlas.nodes), ...pluginScopes()];
  return applyMeta([...base, ...referenceScopes(base, atlas.nodes)]);
}

/** Register every capability with the harness and return the tools and MCP server over them. */
export function startAgent(atlas: Atlas, scopes = consoleScopes(atlas)) {
  registerScopes(scopes);
  const tools = createAgentTools(atlas, scopes);
  return { tools, mcp: createMcpServer(tools) };
}
