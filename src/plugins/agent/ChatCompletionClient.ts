import { PersonaConfig } from "../../mounts/types";
import {
  chatCompletionSettings,
  ChatCompletionSettings,
} from "./ChatCompletionSettings";
import { readStream } from "./ChatCompletionStream";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type ChatMessage = { role: string; content: string };

export type ModelClient = {
  completeChat(
    messages: ChatMessage[],
    onDelta?: (delta: string) => void,
  ): Promise<string>;
};

const DEFAULT_TIMEOUT_MS = 60_000;

export class ChatCompletionClient implements ModelClient {
  constructor(
    private readonly settings: ChatCompletionSettings,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async completeChat(
    messages: ChatMessage[],
    onDelta?: (delta: string) => void,
  ): Promise<string> {
    const response = await this.fetch(this.body(messages));
    const { raw, full } = await readStream(response.body!, onDelta);
    return this.content(full, raw);
  }

  private body(messages: ChatMessage[]) {
    return {
      ...(this.settings.model ? { model: this.settings.model } : {}),
      messages,
      stream: true,
    };
  }

  private content(full: string, raw: string) {
    if (!full) {
      throw new Error(
        `Chat completion response had no message content: ${raw}`,
      );
    }
    return full;
  }

  private async fetch(body: unknown) {
    const url = `${this.settings.apiUrl}/chat/completions`;
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

  private rethrow(error: unknown, url: string): never {
    throw timedOut(error)
      ? new Error(
          `Chat completion request timed out after ${this.timeoutMs}ms: ${url}`,
        )
      : (error as Error);
  }

  private async failure(url: string, response: Response) {
    const body = await response.text().catch(() => "");
    return `Chat completion request failed: ${response.status} ${response.statusText}\nurl: ${url}\nbody: ${body}`;
  }

  private headers() {
    return { "content-type": "application/json" };
  }
}

function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export function chatCompletionClientFor(
  persona: PersonaConfig,
  mount: { endpoint?: string; model?: string },
): ModelClient {
  const settings = resolvedSettings(persona, mount);
  return new ChatCompletionClient(settings);
}

function resolvedSettings(
  persona: PersonaConfig,
  mount: { endpoint?: string; model?: string },
): ChatCompletionSettings {
  const defaults = chatCompletionSettings();
  const apiUrl = persona.endpoint || mount.endpoint || defaults.apiUrl;
  const model = persona.model || mount.model || defaults.model;
  return { apiUrl, model };
}
