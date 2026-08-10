import { GitHubCollectionSource } from "../plugins/github/GitHubCollectionSource";
import { SlackCollectionSource } from "../plugins/slack/SlackCollectionSource";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountRecord, PreparedMountRecord } from "./types";
import { Plugin } from "./Plugin";
import { describePlugins, PluginDescription } from "./PluginDescriptions";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import { GitHubPlugin } from "../plugins/github/GitHubPlugin";
import { SlackPlugin } from "../plugins/slack/SlackPlugin";
import { AgentPlugin } from "../plugins/agent/AgentPlugin";

export class ProviderRegistry {
  private readonly definitions: Map<string, Plugin>;

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

  assertGranted(record: Pick<MountRecord, "id" | "provider" | "capabilities">) {
    const denied = record.capabilities.filter(
      (capability) => !this.allowed(record.provider, capability),
    );
    if (denied.length) {
      throw new Error(this.capabilityError(record, denied));
    }
  }

  describe(name?: string): PluginDescription[] {
    return describePlugins(this.definitions, name);
  }

  private allowed(provider: string, capability: string) {
    return this.definition(provider).capabilities().includes(capability);
  }

  private capabilityError(
    record: Pick<MountRecord, "id" | "provider" | "capabilities">,
    denied: string[],
  ) {
    return this.definition(record.provider)
      .unavailableCapability(record, denied[0])
      || `Capabilities are not granted: ${denied.join(", ")}`;
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
): Plugin[] {
  const githubPlugin = new GitHubPlugin({ github, authenticatedGithub });
  const builtins = [new FixturePlugin(), new AgentPlugin()];
  return [...builtins, githubPlugin, new SlackPlugin(slack)];
}
