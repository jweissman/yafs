import { Plugin } from "../../mounts/Plugin";
import {
  GitHubCollectionSource,
  ProviderSnapshot,
} from "./GitHubCollectionSource";
import { githubConfig } from "./GitHubManifest";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { GitHubConfig, MountConfig, MountRecord } from "../../mounts/types";

interface Sources {
  github?: GitHubCollectionSource;
  authenticatedGithub?: GitHubCollectionSource;
}

export class GitHubPlugin extends Plugin {
  readonly name = "github" as const;

  constructor(private readonly sources: Sources = {}) {
    super();
  }

  capabilities() {
    return [
      "network.github-api",
      ...(this.sources.authenticatedGithub ? ["secret.github-token"] : []),
    ];
  }

  parseConfig(value: unknown) {
    return githubConfig(value);
  }

  // Absolute (leading slash), not relative to the activating session's
  // home — /world is one shared, top-level namespace visible to every
  // principal, not nested under whoever happened to run `plugins apply`.
  // PathResolver.resolve treats a leading-slash path as already-final and
  // ignores the session root entirely, so this is the whole mechanism.
  defaultPath(config: MountConfig): string {
    return `/world/github/${(config as GitHubConfig).repository}`;
  }

  worldDescription(): string {
    return (
      "GitHub PR collection: pulls/<number>/{metadata.json,diff.patch}. " +
      "This mount's own path names the owner/repo (/world/github/<owner>/" +
      "<repo>) -- cite a PR as https://github.com/<owner>/<repo>/pull/<number> " +
      "(singular \"pull\", not the \"pulls/\" directory name)."
    );
  }

  unavailableCapability(record: Pick<MountRecord, "id">, capability: string) {
    return capability === "secret.github-token"
      ? tokenUnavailable(record)
      : undefined;
  }

  async prepare(record: MountRecord, snapshots: SnapshotMaterializer) {
    const source = this.requiredSource(record);
    const captured = await source.snapshot(record.config as GitHubConfig);
    return snapshots.prepare(
      this.fetchedRecord(record, captured),
      captured.entries,
      captured.resourceReferences,
    );
  }

  private requiredSource(record: MountRecord) {
    const source = record.capabilities.includes("secret.github-token")
      ? this.sources.authenticatedGithub
      : this.sources.github;
    if (!source) {
      throw new Error(configurationError(record));
    }
    return source;
  }

  private fetchedRecord(record: MountRecord, snapshot: ProviderSnapshot) {
    return {
      ...record,
      revision: snapshot.revision,
      fetchedAt: snapshot.fetchedAt,
    };
  }
}

function configurationError(record: MountRecord) {
  return record.capabilities.includes("secret.github-token")
    ? tokenUnavailable(record)
    : `GitHub plugin '${record.id}' has no GitHub source configured.`;
}

function tokenUnavailable(record: Pick<MountRecord, "id">) {
  return (
    `GitHub plugin '${record.id}' requires secret.github-token, but ` +
    "YAFS_GITHUB_TOKEN was unavailable when yafsd started. Add it to the " +
    "daemon environment, or remove the grant for a public collection."
  );
}
