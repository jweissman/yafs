import { SlackSettings, slackSettings } from "./SlackSettings";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type SlackMessage = { user?: string; text: string; ts: string };
export type SlackChannelClient = {
  history(channel: string, max: number): Promise<SlackMessage[]>;
  postMessage(channel: string, text: string): Promise<string>;
  identity(): Promise<string>;
  addReaction(channel: string, timestamp: string, name: string): Promise<void>;
  removeReaction(
    channel: string,
    timestamp: string,
    name: string,
  ): Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export class SlackApiClient {
  constructor(
    private readonly settings: SlackSettings,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async history(channel: string, max: number): Promise<SlackMessage[]> {
    const params = new URLSearchParams({ channel, limit: String(max) });
    const body = await this.call(`conversations.history?${params}`, {
      method: "GET",
    });
    return (body.messages as SlackMessage[] | undefined) || [];
  }

  async postMessage(channel: string, text: string): Promise<string> {
    const init = { method: "POST", body: JSON.stringify({ channel, text }) };
    const body = await this.call("chat.postMessage", init);
    return body.ts as string;
  }

  async identity(): Promise<string> {
    const body = await this.call("auth.test", { method: "POST" });
    return body.user_id as string;
  }

  addReaction(channel: string, timestamp: string, name: string) {
    return this.reaction("reactions.add", channel, timestamp, name);
  }

  removeReaction(channel: string, timestamp: string, name: string) {
    return this.reaction("reactions.remove", channel, timestamp, name);
  }

  private async reaction(
    path: string,
    channel: string,
    timestamp: string,
    name: string,
  ) {
    const body = JSON.stringify({ channel, timestamp, name });
    await this.call(path, { method: "POST", body });
  }

  private async call(
    path: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetch(path, init);
    return this.checked(
      path,
      (await response.json()) as Record<string, unknown>,
    );
  }

  private checked(path: string, body: Record<string, unknown>) {
    if (body.ok !== true) {
      throw new Error(`Slack API request failed: ${path} -> ${body.error}`);
    }
    return body;
  }

  private async fetch(path: string, init: RequestInit) {
    const url = `${this.settings.apiUrl}/${path}`;
    const signal = AbortSignal.timeout(this.timeoutMs);
    return this.request(url, {
      ...init,
      headers: this.headers(),
      signal,
    }).catch((error) => this.rethrow(error, url));
  }

  private rethrow(error: unknown, url: string): never {
    throw timedOut(error)
      ? new Error(
          `Slack API request timed out after ${this.timeoutMs}ms: ${url}`,
        )
      : (error as Error);
  }

  private headers() {
    return {
      authorization: `Bearer ${this.settings.token}`,
      "content-type": "application/json",
    };
  }
}

function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export function defaultSlackClient(): SlackApiClient {
  return new SlackApiClient(slackSettings());
}
