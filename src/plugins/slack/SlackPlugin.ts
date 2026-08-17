import {
  Plugin,
  PluginActionDefinition,
  Wiring,
  PluginDriver,
} from "../../mounts/Plugin";
import { slackConfig } from "./SlackManifest";
import { slackCommands } from "./SlackCommands";
import { SlackDirectoryDriver } from "./SlackDirectoryDriver";
import { SlackCollectionSource, SlackSnapshot } from "./SlackCollectionSource";
import { SlackChannelClient } from "./SlackApiClient";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { MountConfig, MountRecord, SlackConfig } from "../../mounts/types";

export type SlackClientFor = (config: SlackConfig) => SlackChannelClient;

export class SlackPlugin extends Plugin {
  readonly name = "slack" as const;

  constructor(private readonly source?: SlackCollectionSource) {
    super();
  }

  capabilities() {
    return ["network.slack-api", "secret.slack-token"];
  }

  parseConfig(value: unknown) {
    return slackConfig(value);
  }

  // Collides across two Slack mounts on different workspaces, since
  // SlackConfig has no workspace/team field — only a bare channel id. An
  // explicit path: is required once more than one Slack mount is active;
  // see PRODUCT-SPEC.md's "Namespace: three concepts" section.
  // Absolute (leading slash) for the same reason as GitHubPlugin's
  // defaultPath: /world is one shared top-level namespace, not nested
  // under the activating session's own home.
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

  createDriver(wiring: Wiring, slackClientFor: SlackClientFor): PluginDriver {
    return new SlackDirectoryDriver(wiring, slackClientFor);
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
