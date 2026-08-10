import {
  Plugin,
  PluginActionDefinition,
  Wiring,
  PluginDriver,
} from "../../mounts/Plugin";
import { slackConfig } from "./SlackManifest";
import { slackCommands } from "./SlackCommands";
import { SlackDirectoryDriver, SlackPoster } from "./SlackDirectoryDriver";
import { SlackCollectionSource, SlackSnapshot } from "./SlackCollectionSource";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { MountRecord, SlackConfig } from "../../mounts/types";

export type SlackClientFor = (config: SlackConfig) => SlackPoster;

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
    return new SlackDirectoryDriver(
      wiring.mounts,
      wiring.journal,
      wiring.enqueue,
      { registerCtl: wiring.registerCtl, unregisterCtl: wiring.unregisterCtl },
      slackClientFor,
    );
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
