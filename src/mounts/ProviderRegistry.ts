import { GitHubCollectionSource } from "../plugins/github/GitHubCollectionSource";
import { SlackCollectionSource } from "../plugins/slack/SlackCollectionSource";
import { GitHubSettings } from "../plugins/github/GitHubSettings";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { MountRecord, PreparedMountRecord } from "./types";
import { Plugin } from "./Plugin";
import { describePlugins, PluginDescription } from "./PluginDescriptions";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import { GitHubPlugin } from "../plugins/github/GitHubPlugin";
import { SlackPlugin } from "../plugins/slack/SlackPlugin";
import { AgentPlugin } from "../plugins/agent/AgentPlugin";
import { SchedulerPlugin } from "../plugins/scheduler/SchedulerPlugin";

export interface ProviderSources {
  github?: GitHubCollectionSource;
  authenticatedGithub?: GitHubCollectionSource;
  slack?: SlackCollectionSource;

  gitSettings?: GitHubSettings;
}

export class ProviderRegistry {
  private readonly definitions: Map<string, Plugin>;

  constructor(
    github?: GitHubCollectionSource,
    authenticatedGithub?: GitHubCollectionSource,
    slack?: SlackCollectionSource,
    gitSettings?: GitHubSettings,
  ) {
    const sources = { github, authenticatedGithub, slack, gitSettings };
    this.definitions = definitionsMap(providerDefinitions(sources));
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
    const definition = this.definition(record.provider);
    const fallback = `Capabilities are not granted: ${denied.join(", ")}`;
    return definition.unavailableCapability(record, denied[0]) ?? fallback;
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

function definitionsMap(list: Plugin[]): Map<string, Plugin> {
  return new Map(list.map((definition) => [definition.name, definition]));
}

function providerDefinitions(sources: ProviderSources): Plugin[] {
  const { github, authenticatedGithub, slack, gitSettings } = sources;

  const githubSources = { github, authenticatedGithub };
  const githubPlugin = new GitHubPlugin(githubSources, gitSettings);
  return [...builtinPlugins(), githubPlugin, new SlackPlugin(slack)];
}

function builtinPlugins(): Plugin[] {
  return [new FixturePlugin(), new AgentPlugin(), new SchedulerPlugin()];
}
