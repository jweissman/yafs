import {
  Plugin,
  PluginActionDefinition,
  PluginExposureDefinition,
  Wiring,
  PluginDriver,
} from "../../mounts/Plugin";
import { agentConfig } from "./AgentManifest";
import { agentCommands } from "./AgentCommands";
import { AgentDirectoryDriver } from "./AgentDirectoryDriver";
import { ModelClient } from "./ChatCompletionClient";
import { carryForward } from "../../mounts/SnapshotCarryForward";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import {
  AgentConfig,
  MountRecord,
  PersonaConfig,
  PreparedMountRecord,
} from "../../mounts/types";

export type ModelFor = (
  persona: PersonaConfig,
  mount: AgentConfig,
) => ModelClient;

export class AgentPlugin extends Plugin {
  readonly name = "agent" as const;

  constructor() {
    super();
  }

  capabilities() {
    return ["chat.completion"];
  }

  parseConfig(value: unknown) {
    return agentConfig(value);
  }

  actions(): PluginActionDefinition[] {
    return [
      {
        name: "send",
        capability: "chat.completion",
        transport: "ctl",
        pseudobinary: "agent send PERSONA [--context PATH] MESSAGE",
      },
    ];
  }

  exposures(): PluginExposureDefinition[] {
    return [{ name: "conversation", protocol: "http", status: "designed" }];
  }

  commands() {
    return agentCommands();
  }

  createDriver(wiring: Wiring, modelFor: ModelFor): PluginDriver {
    return new AgentDirectoryDriver(
      wiring.mounts,
      wiring.journal,
      wiring.enqueue,
      { registerCtl: wiring.registerCtl, unregisterCtl: wiring.unregisterCtl },
      modelFor,
    );
  }

  prepare(
    record: MountRecord,
    snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord,
  ) {
    const config = record.config as AgentConfig;
    const fresh = this.personaEntries(config);
    return snapshots.prepare(
      record,
      carryForward(fresh, current, (path) => path.includes("/runs/")),
    );
  }

  private personaEntries(config: AgentConfig): [string, string][] {
    return Object.entries(config.personas).map(([name, persona]) => [
      `${name}/prompt.md`,
      persona.prompt,
    ]);
  }
}
