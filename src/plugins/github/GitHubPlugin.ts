import { CitationRenderer, Plugin } from "../../mounts/Plugin";
import { GitHubCollectionSource } from "./GitHubCollectionSource";
import { githubConfig } from "./GitHubManifest";
import { githubCitationRenderer } from "./GitHubCitation";
import { GitHubSettings, githubSettings } from "./GitHubSettings";
import { syncSourceMirror } from "./GitHubSourceMirror";
import { githubWorldDescription } from "./GitHubWorldDescription";
import { configurationError, tokenUnavailable } from "./GitHubPluginErrors";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { GitHubConfig, MountConfig, MountRecord } from "../../mounts/types";
import {
  emptySnapshot,
  fetchedRecord,
  sourceMarker,
} from "./GitHubFetchedRecord";

interface Sources {
  github?: GitHubCollectionSource;
  authenticatedGithub?: GitHubCollectionSource;
}

export class GitHubPlugin extends Plugin {
  readonly name = "github" as const;

  constructor(
    private readonly sources: Sources = {},
    private readonly gitSettings: GitHubSettings = githubSettings(),
  ) {
    super();
  }

  capabilities() {
    return [
      "network.github-api",
      "host.git-read",
      ...(this.sources.authenticatedGithub ? ["secret.github-token"] : []),
    ];
  }

  parseConfig(value: unknown) {
    return githubConfig(value);
  }

  defaultPath(config: MountConfig): string {
    return `/world/github/${(config as GitHubConfig).repository}`;
  }

  worldDescription(): string {
    return githubWorldDescription();
  }

  citationRenderers(): CitationRenderer[] {
    return [githubCitationRenderer()];
  }

  unavailableCapability(record: Pick<MountRecord, "id">, capability: string) {
    return capability === "secret.github-token"
      ? tokenUnavailable(record)
      : undefined;
  }

  async prepare(record: MountRecord, snapshots: SnapshotMaterializer) {
    const captured = await this.collectionSnapshot(record);
    const mirrored = await this.mirroredIfGranted(record);
    const fetched = fetchedRecord(record, captured, mirrored);
    const entries = [...captured.entries, ...sourceMarker(mirrored)];
    return snapshots.prepare(fetched, entries, captured.resourceReferences);
  }

  private collectionSnapshot(record: MountRecord) {
    const config = record.config as GitHubConfig;
    return config.pulls || config.commits
      ? this.requiredSource(record).snapshot(config)
      : Promise.resolve(emptySnapshot());
  }

  private mirroredIfGranted(record: MountRecord) {
    return record.capabilities.includes("host.git-read")
      ? syncSourceMirror(this.gitSettings, record)
      : { sha: undefined, paths: undefined };
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
}
