import { PersonaConfig } from "../../mounts/types";
import {
  chatCompletionSettings,
  ChatCompletionSettings,
} from "./ChatCompletionSettings";
import { readStream } from "./ChatCompletionStream";
import { fetchCompletion, Fetch } from "./ChatCompletionFetch";

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

  private fetch(body: unknown) {
    const url = `${this.settings.apiUrl}/chat/completions`;
    return fetchCompletion(this.request, url, body, this.timeoutMs);
  }
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
