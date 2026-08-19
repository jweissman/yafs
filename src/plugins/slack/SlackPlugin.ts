import {
  Plugin,
  PluginActionDefinition,
  Wiring,
  PluginDriver,
} from "../../mounts/Plugin";
import { slackConfig } from "./SlackManifest";
import { slackCommands } from "./SlackCommands";
import { SlackDirectoryDriver } from "./SlackDirectoryDriver";
import { SlackInboundPoller } from "./SlackInboundPoller";
import { SlackCollectionSource, SlackSnapshot } from "./SlackCollectionSource";
import { SlackChannelClient } from "./SlackApiClient";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { MountConfig, MountRecord, SlackConfig } from "../../mounts/types";

export type SlackClientFor = (config: SlackConfig) => SlackChannelClient;

export interface SlackDriverConfig {
  clientFor: SlackClientFor;
  pollIntervalMs?: number;
}

export class SlackPlugin extends Plugin {
  readonly name = "slack" as const;

  constructor(
    private readonly source?: SlackCollectionSource,
    private readonly driverConfig?: SlackDriverConfig,
  ) {
    super();
  }

  capabilities() {
    return ["network.slack-api", "secret.slack-token"];
  }

  parseConfig(value: unknown) {
    return slackConfig(value);
  }

  defaultPath(config: MountConfig): string {
    return `/world/slack/channels/${(config as SlackConfig).channel}`;
  }

  worldDescription(): string {
    return "Slack channel history: messages.ndjson";
  }

  actions(): PluginActionDefinition[] {
    return [
      {
        name: "send",
        capability: "network.slack-api",
        transport: "ctl",
        pseudobinary: "slack send PLUGIN_ID MESSAGE",
      },
    ];
  }

  commands() {
    return slackCommands();
  }

  createDriver(wiring: Wiring): PluginDriver[] {
    return this.driverConfig ? drivers(wiring, this.driverConfig) : [];
  }

  async prepare(record: MountRecord, snapshots: SnapshotMaterializer) {
    const captured = await this.required().snapshot(
      record.config as SlackConfig,
    );
    return snapshots.prepare(
      this.fetchedRecord(record, captured),
      captured.entries,
    );
  }

  private required(): SlackCollectionSource {
    if (!this.source) {
      throw new Error("Slack provider is not configured");
    }
    return this.source;
  }

  private fetchedRecord(record: MountRecord, snapshot: SlackSnapshot) {
    return {
      ...record,
      revision: snapshot.revision,
      fetchedAt: snapshot.fetchedAt,
    };
  }
}

function drivers(wiring: Wiring, config: SlackDriverConfig): PluginDriver[] {
  const { clientFor, pollIntervalMs } = config;
  const { mounts, dispatchCtl } = wiring;
  return [
    new SlackDirectoryDriver(wiring, clientFor),
    new SlackInboundPoller(mounts, dispatchCtl, clientFor, pollIntervalMs),
  ];
}
