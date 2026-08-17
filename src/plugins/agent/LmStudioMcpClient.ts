import { loggedFailure, logRequest, logResponse } from "./LmStudioMcpClientLog";
import { parseTurn } from "./LmStudioTurnParsing";
import {
  LmStudioSettings,
  LmStudioTurn,
  LmStudioTurnRequest,
} from "./LmStudioMcpClientTypes";

export type {
  PluginIntegration,
  LmStudioOutputItem,
  LmStudioTurn,
  LmStudioTurnRequest,
  ToolClient,
  ToolClientFor,
  LmStudioSettings,
} from "./LmStudioMcpClientTypes";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

// Must stay comfortably above AgentToolServerBudgets.ts's own MCP-session
// deadline (5 minutes) -- this timeout wraps the *entire* incoming LM
// Studio request, including every outbound tool call LM Studio makes back
// against that MCP session during a rich tool-call turn, plus whatever
// generation time comes after. A shorter outer timeout here would abort
// the whole turn before the inner session budget could ever be reached.
// 10 minutes still wasn't enough live: a local model reasoning over
// several accumulated PR diffs/metadata after a dozen-plus tool calls can
// legitimately run long on typical local hardware, and token budget isn't
// a real constraint here (local inference, no per-token cost). Override
// per environment via YAFS_LMSTUDIO_TIMEOUT_MS if 30 minutes still isn't
// enough, rather than raising this default again.
const DEFAULT_TIMEOUT_MS = 1_800_000;

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
    const response = await this.fetch(url, this.body(turn)).catch(
      (error: unknown) => loggedFailure(url, error),
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
    const response = await this.post(url, body).catch((error: unknown) =>
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
