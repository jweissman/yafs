import { createHash } from "node:crypto";

import { SlackMessage } from "./SlackApiClient";
import { SlackConfig } from "./types";

export type SlackClient = {
  history(channel: string, max: number): Promise<SlackMessage[]>;
};
export type SlackSnapshot = {
  entries: [string, string][];
  revision: string;
  fetchedAt: string;
};

const DEFAULT_MAX = 50;

export class SlackCollectionSource {
  constructor(private readonly client: SlackClient) {}

  async snapshot(config: SlackConfig): Promise<SlackSnapshot> {
    const messages = await this.client.history(
      config.channel,
      config.max || DEFAULT_MAX,
    );
    return {
      entries: [["messages.ndjson", rendered(messages)]],
      revision: revision(messages),
      fetchedAt: new Date().toISOString(),
    };
  }
}

function rendered(messages: SlackMessage[]) {
  return messages
    .slice()
    .reverse()
    .map((message) => JSON.stringify(message))
    .join("\n");
}

function revision(messages: SlackMessage[]) {
  return `slack:${createHash("sha256").update(JSON.stringify(messages)).digest("hex").slice(0, 12)}`;
}
