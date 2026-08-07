import { GitHubCollectionSource } from "./GitHubCollectionSource";
import { SlackCollectionSource } from "./SlackCollectionSource";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountRecord, PreparedMountRecord } from "./types";
import { ProviderDefinition } from "./ProviderDefinition";
import { describePlugins, PluginDescription } from "./PluginDescriptions";
import { fixtureDefinition } from "./FixturePlugin";
import { githubDefinition } from "./GitHubPlugin";
import { slackDefinition } from "./SlackPlugin";
import { agentDefinition } from "../agents/AgentPlugin";

export class ProviderRegistry {
  private readonly definitions: Map<string, ProviderDefinition>;

  constructor(
    github?: GitHubCollectionSource,
    authenticatedGithub?: GitHubCollectionSource,
    slack?: SlackCollectionSource,
  ) {
    const list = providerDefinitions(github, authenticatedGithub, slack);
    this.definitions = new Map(
      list.map((definition) => [definition.name, definition]),
    );
  }

  assertGranted(record: { provider: string; capabilities: string[] }) {
    const denied = record.capabilities.filter(
      (capability) => !this.allowed(record.provider, capability),
    );
    if (denied.length) {
      throw new Error(`Capabilities are not granted: ${denied.join(", ")}`);
    }
  }

  describe(name?: string): PluginDescription[] {
    return describePlugins(this.definitions, name);
  }

  private allowed(provider: string, capability: string) {
    return this.definition(provider).capabilities().includes(capability);
  }

  prepare(
    record: MountRecord,
    snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord,
  ): PreparedMountRecord | Promise<PreparedMountRecord> {
    return this.definition(record.provider).prepare(record, snapshots, current);
  }

  private definition(name: string) {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Unknown provider: ${name}`);
    }
    return definition;
  }
}

function providerDefinitions(
  github?: GitHubCollectionSource,
  authenticatedGithub?: GitHubCollectionSource,
  slack?: SlackCollectionSource,
): ProviderDefinition[] {
  return [
    fixtureDefinition(),
    agentDefinition(),
    githubDefinition({ github, authenticatedGithub }),
    slackDefinition(slack),
  ];
}
