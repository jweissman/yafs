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
