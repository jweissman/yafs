import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import { advanceCursor, Cursor, newMessages } from "./SlackInboundSchedule";
import { DispatchCtl, RouteOptions, routeMessage } from "./SlackInboundRouting";
import { SlackChannelClient, SlackMessage } from "./SlackApiClient";

type InboundConfig = SlackConfig & { persona: string };
const DEFAULT_POLL_MS = 3000;

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
      await this.drain(record, config);
    } finally {
      this.busy.delete(record.id);
    }
  }

  private async drain(record: PreparedMountRecord, config: InboundConfig) {
    const client = this.clientFor(config);
    const botUserId = await this.identity(record, client);
    const cursor = this.cursors.get(record.id) || {};
    const fetched = await client.history(config.channel, config.max ?? 50);
    const fresh = newMessages(botUserId, cursor, fetched);
    await this.route(record, config, botUserId, fresh);
    this.cursors.set(record.id, advanceCursor(cursor, fresh));
  }

  private async identity(
    record: PreparedMountRecord,
    client: SlackChannelClient,
  ) {
    const cached = this.botUserIds.get(record.id);
    return cached ?? this.fetchIdentity(record, client);
  }

  private async fetchIdentity(
    record: PreparedMountRecord,
    client: SlackChannelClient,
  ) {
    const id = await client.identity();
    this.botUserIds.set(record.id, id);
    return id;
  }

  private async route(
    record: PreparedMountRecord,
    config: InboundConfig,
    botUserId: string,
    messages: SlackMessage[],
  ) {
    const options = this.routeOptions(record, config, botUserId);
    const chatId = channelChatId(record.id, config.channel);
    await routeAll(options, chatId, messages);
  }

  private routeOptions(
    record: PreparedMountRecord,
    config: InboundConfig,
    botUserId: string,
  ) {
    const slackCtlPath = `${record.path}/ctl` as AbsolutePath;
    const { mounts, dispatchCtl } = this;
    const persona = config.persona;
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
