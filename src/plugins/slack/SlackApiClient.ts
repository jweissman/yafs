import { SlackSettings, slackSettings } from "./SlackSettings";
import { ApiRequest, call, Fetch } from "./SlackApiFetch";

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

  private call(path: string, init: RequestInit) {
    return call(this.deps(), path, init);
  }
  private deps(): ApiRequest {
    const { settings, request, timeoutMs } = this;
    return { settings, request, timeoutMs };
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
}

export function defaultSlackClient(): SlackApiClient {
  return new SlackApiClient(slackSettings());
}
