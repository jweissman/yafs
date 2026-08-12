import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import {
  advanceCursor,
  baselineCursor,
  Cursor,
  newMessages,
} from "./SlackInboundSchedule";
import { DispatchCtl, RouteOptions, routeMessage } from "./SlackInboundRouting";
import { SlackChannelClient, SlackMessage } from "./SlackApiClient";

type InboundConfig = SlackConfig & { persona: string };
const DEFAULT_POLL_MS = 3000;

type Poll = {
  record: PreparedMountRecord;
  config: InboundConfig;
  client: SlackChannelClient;
};
type Msgs = SlackMessage[];

export class SlackInboundPoller {
  private timer?: Timer;
  private cursors = new Map<string, Cursor>();
  private botUserIds = new Map<string, string>();
  private busy = new Set<string>();

  constructor(
    private readonly mounts: MountManager,
    private readonly dispatchCtl: DispatchCtl,
    private readonly clientFor: (config: SlackConfig) => SlackChannelClient,
    private readonly pollIntervalMs = DEFAULT_POLL_MS,
  ) {}

  start() {
    this.timer = setInterval(() => void this.tick(), this.pollIntervalMs);
  }
  close() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
  sync() {}

  private async tick() {
    for (const record of this.mounts.mounts()) {
      await this.tickRecord(record);
    }
  }

  private async tickRecord(record: PreparedMountRecord) {
    const config = inboundConfig(record);
    if (config && !this.busy.has(record.id)) {
      await this.pollMount(record, config);
    }
  }

  private async pollMount(record: PreparedMountRecord, config: InboundConfig) {
    this.busy.add(record.id);
    try {
      await this.drain({ record, config, client: this.clientFor(config) });
    } finally {
      this.busy.delete(record.id);
    }
  }

  private history(poll: Poll) {
    return poll.client.history(poll.config.channel, poll.config.max ?? 50);
  }

  private async drain(poll: Poll) {
    const cursor = this.cursors.get(poll.record.id);
    const fetched = await this.history(poll);
    if (!cursor) {
      this.cursors.set(poll.record.id, baselineCursor(fetched));
      return;
    }
    await this.drainFetched(poll, cursor, fetched);
  }

  private async drainFetched(poll: Poll, cursor: Cursor, fetched: Msgs) {
    const botUserId = await this.identity(poll);
    const requireMention = poll.config.requireMention ?? true;
    const fresh = newMessages(botUserId, cursor, fetched, requireMention);
    await this.route(poll, botUserId, fresh);
    this.cursors.set(poll.record.id, advanceCursor(cursor, fresh));
  }

  private async identity(poll: Poll) {
    const cached = this.botUserIds.get(poll.record.id);
    if (cached) {
      return cached;
    }
    const id = await poll.client.identity();
    this.botUserIds.set(poll.record.id, id);
    return id;
  }

  private async route(poll: Poll, botUserId: string, messages: SlackMessage[]) {
    const options = this.routeOptions(poll, botUserId);
    const chatId = channelChatId(poll.record.id, poll.config.channel);
    await routeAll(options, chatId, messages);
  }

  private routeOptions(poll: Poll, botUserId: string) {
    const slackCtlPath = `${poll.record.path}/ctl` as AbsolutePath;
    const { mounts, dispatchCtl } = this;
    const persona = poll.config.persona;
    return { mounts, dispatchCtl, persona, slackCtlPath, botUserId };
  }
}

async function routeAll(
  options: RouteOptions,
  chatId: string,
  messages: SlackMessage[],
) {
  for (const message of messages) {
    await routeMessage(options, chatId, message);
  }
}

function inboundConfig(record: PreparedMountRecord): InboundConfig | undefined {
  if (record.provider !== "slack") {
    return undefined;
  }
  const config = record.config as SlackConfig;
  return config.persona ? (config as InboundConfig) : undefined;
}

function channelChatId(mountId: string, channel: string): string {
  return `slack-${mountId}-${channel}`;
}
