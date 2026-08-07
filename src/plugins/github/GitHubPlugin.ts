import { Plugin } from "../../mounts/Plugin";
import {
  GitHubCollectionSource,
  ProviderSnapshot,
} from "./GitHubCollectionSource";
import { githubConfig } from "./GitHubManifest";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { GitHubConfig, MountRecord } from "../../mounts/types";

type Sources = {
  github?: GitHubCollectionSource;
  authenticatedGithub?: GitHubCollectionSource;
};

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
      throw new Error("GitHub provider is not configured");
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
