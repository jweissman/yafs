import { PersonaConfig } from "../../mounts/types";

export interface PluginIntegration {
  type: "plugin";
  id: string;
}

export type LmStudioOutputItem =
  | { type: "message"; content: string }
  | { type: "tool_call"; tool: string; arguments: unknown; output: string }
  | { type: "reasoning"; content: string }
  | { type: "invalid_tool_call"; reason: string; metadata: unknown };

export interface LmStudioTurn {
  output: LmStudioOutputItem[];
  responseId?: string;
}

export interface LmStudioTurnRequest {
  input: string;
  systemPrompt: string;
  integrations: PluginIntegration[];
  previousResponseId?: string;
}

export interface ToolClient {
  respond(turn: LmStudioTurnRequest): Promise<LmStudioTurn>;
}
export type ToolClientFor = (
  persona: PersonaConfig,
  mount: { endpoint?: string; model?: string },
) => ToolClient;

export interface LmStudioSettings {
  apiUrl: string;
  model?: string;
  accessToken?: string;
}
