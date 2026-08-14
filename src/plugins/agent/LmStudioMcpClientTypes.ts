import { PersonaConfig } from "../../mounts/types";

// The only integration shape Yafs ever sends: a reference to its own
// scoped MCP server (AgentToolServer), pre-registered in LM Studio's own
// mcp.json by AgentToolMcpSync (see that file). NOT `ephemeral_mcp` — LM
// Studio's SSRF guard rejects loopback URLs for that per-request/dynamic
// integration type; only mcp.json-declared `plugin` servers are exempt,
// since registering one requires local filesystem access to begin with.
export type PluginIntegration = {
  type: "plugin";
  id: string;
};

export type LmStudioOutputItem =
  | { type: "message"; content: string }
  | { type: "tool_call"; tool: string; arguments: unknown; output: string }
  | { type: "reasoning"; content: string }
  | { type: "invalid_tool_call"; reason: string; metadata: unknown };

export type LmStudioTurn = {
  output: LmStudioOutputItem[];
  responseId?: string;
};

export type LmStudioTurnRequest = {
  input: string;
  systemPrompt: string;
  integrations: PluginIntegration[];
  previousResponseId?: string;
};

export type ToolClient = {
  respond(turn: LmStudioTurnRequest): Promise<LmStudioTurn>;
};
export type ToolClientFor = (
  persona: PersonaConfig,
  mount: { endpoint?: string; model?: string },
) => ToolClient;

export type LmStudioSettings = {
  apiUrl: string;
  model?: string;
  accessToken?: string;
};
