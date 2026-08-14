import { PersonaConfig } from "../../mounts/types";
import { loggedFailure, logRequest, logResponse } from "./LmStudioMcpClientLog";
import { parseTurn } from "./LmStudioTurnParsing";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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

const DEFAULT_TIMEOUT_MS = 120_000;

export class LmStudioMcpClient {
  constructor(
    private readonly settings: LmStudioSettings,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async respond(turn: LmStudioTurnRequest): Promise<LmStudioTurn> {
    const url = `${this.settings.apiUrl}/chat`;
    logRequest(url, this.settings.model);
    const parsed = await this.attempt(url, turn);
    logResponse(url, parsed);
    return parsed;
  }

  private async attempt(url: string, turn: LmStudioTurnRequest) {
    const response = await this.fetch(url, this.body(turn)).catch((error) =>
      loggedFailure(url, error),
    );
    return parseTurn(await response.json());
  }

  private body(turn: LmStudioTurnRequest) {
    return {
      ...(this.settings.model ? { model: this.settings.model } : {}),
      ...previousResponseIdField(turn.previousResponseId),
      input: turn.input,
      system_prompt: turn.systemPrompt,
      integrations: turn.integrations,
      stream: false,
    };
  }

  private async fetch(url: string, body: unknown) {
    const response = await this.post(url, body).catch((error) =>
      this.rethrow(error, url),
    );
    if (!response.ok) {
      throw new Error(await this.failure(url, response));
    }
    return response;
  }

  private post(url: string, body: unknown) {
    const init = {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    return this.request(url, init);
  }

  // Required whenever "Allow calling servers from mcp.json" is on, since
  // that setting itself requires "Require Authentication" in LM Studio.
  private headers(): Record<string, string> {
    const token = this.settings.accessToken;
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  private rethrow(error: unknown, url: string): never {
    throw timedOut(error)
      ? new Error(
          `LM Studio chat request timed out after ${this.timeoutMs}ms: ${url}`,
        )
      : (error as Error);
  }

  private async failure(url: string, response: Response) {
    const body = await response.text().catch(() => "");
    return `LM Studio chat request failed: ${response.status} ${response.statusText}\nurl: ${url}\nbody: ${body}`;
  }
}

function previousResponseIdField(previousResponseId?: string) {
  return previousResponseId ? { previous_response_id: previousResponseId } : {};
}

function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export { finalMessage } from "./LmStudioFinalMessage";
