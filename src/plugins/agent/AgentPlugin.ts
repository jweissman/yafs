import {
  Plugin,
  PluginActionDefinition,
  PluginExposureDefinition,
  Wiring,
  PluginDriver,
} from "../../mounts/Plugin";
import { agentConfig } from "./AgentManifest";
import { agentCommands } from "./AgentCommands";
import { AgentClients, AgentDirectoryDriver } from "./AgentDirectoryDriver";
import { AgentToolMcpSync } from "./AgentToolMcpSync";
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

export interface AgentDriverConfig extends AgentClients {
  mcpJsonPath?: string;
}

export class AgentPlugin extends Plugin {
  readonly name = "agent" as const;

  constructor(private readonly driverConfig?: AgentDriverConfig) {
    super();
  }
  capabilities() {
    return ["chat.completion"];
  }

  parseConfig(value: unknown) {
    return agentConfig(value);
  }

  actions(): PluginActionDefinition[] {
    return [sendAction()];
  }

  exposures(): PluginExposureDefinition[] {
    return [{ name: "conversation", protocol: "http", status: "designed" }];
  }

  commands() {
    return agentCommands();
  }

  createDriver(wiring: Wiring): PluginDriver[] {
    if (!this.driverConfig) {
      return [];
    }
    const { mcpJsonPath, ...clients } = this.driverConfig;
    return [
      new AgentDirectoryDriver(wiring, clients),
      new AgentToolMcpSync(wiring.mounts, clients.toolServerUrl, mcpJsonPath),
    ];
  }

  prepare(
    record: MountRecord,
    snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord,
  ) {
    const fresh = this.personaEntries(record.config as AgentConfig);
    const isRun = (path: string) => path.includes("/runs/");
    return snapshots.prepare(record, carryForward(fresh, current, isRun));
  }

  private personaEntries(config: AgentConfig): [string, string][] {
    return Object.entries(config.personas).map(([name, persona]) => [
      `${name}/prompt.md`,
      persona.prompt,
    ]);
  }
}

function sendAction(): PluginActionDefinition {
  return {
    name: "send",
    capability: "chat.completion",
    transport: "ctl",
    pseudobinary: "agent send PERSONA [--context PATH] [--chat CHATID] MESSAGE",
  };
}
