import { createHash } from "node:crypto";

import { GitHubConfig } from "../../mounts/types";
import { pullMetadata } from "./GitHubPullMetadata";

export interface GitHubPull {
  number: number;
  title: string;
  updatedAt: string;
  headSha: string;
  diff: string;
  author?: string;
  draft?: boolean;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  body?: string;
  createdAt?: string;
  comments?: number;
  reviewComments?: number;
  mergeableState?: string;
  labels?: string[];
  htmlUrl?: string;
}
export interface GitHubClient {
  pulls(config: GitHubConfig): Promise<GitHubPull[]>;
}
export interface GitHubPullFetcher {
  pull(repository: string, number: number): Promise<GitHubPull>;
}
export interface ProviderSnapshot {
  entries: [string, string][];
  revision: string;
  fetchedAt: string;
  resourceReferences: Record<string, object>;
}
export interface GitHubResourceReference {
  kind: "github-pr";
  repository: string;
  number: number;
  headSha: string;
  title: string;
  url: string;
}

const DEFAULT_WEB_URL = "https://github.com";

export class GitHubCollectionSource {
  constructor(
    private readonly client: GitHubClient,
    private readonly webUrl: string = DEFAULT_WEB_URL,
  ) {}

  async snapshot(config: GitHubConfig): Promise<ProviderSnapshot> {
    const pulls = await this.client.pulls(config);
    return {
      entries: this.entries(pulls),
      revision: this.revision(pulls),
      fetchedAt: new Date().toISOString(),
      resourceReferences: this.references(config, pulls),
    };
  }

  private entries(pulls: GitHubPull[]) {
    return pulls.flatMap((pull) => this.pullEntries(pull));
  }
  private pullEntries(pull: GitHubPull): [string, string][] {
    const root = `pulls/${pull.number}`;
    return [
      [`${root}/diff.patch`, pull.diff],
      [`${root}/metadata.json`, JSON.stringify(pullMetadata(pull))],
    ];
  }
  private references(config: GitHubConfig, pulls: GitHubPull[]) {
    return Object.fromEntries(
      pulls.map((pull) => [
        `pulls/${pull.number}`,
        this.reference(config, pull),
      ]),
    );
  }
  // Prefer GitHub's own html_url over constructing one from webUrl: GitHub
  // is the authoritative source for its own URLs, so this can't drift out
  // of sync with a real deployment's host the way a manually-constructed
  // one already did once (github.com hardcoded against a real GHEC repo).
  // The constructed form stays as a fallback for callers/fixtures that
  // don't supply htmlUrl.
  private reference(
    config: GitHubConfig,
    pull: GitHubPull,
  ): GitHubResourceReference {
    const { number, headSha, title, htmlUrl } = pull;
    const { repository } = config;
    const url = htmlUrl ?? `${this.webUrl}/${repository}/pull/${String(number)}`;
    return { kind: "github-pr", repository, number, headSha, title, url };
  }
  private revision(pulls: GitHubPull[]) {
    return `github:${createHash("sha256").update(JSON.stringify(pulls)).digest("hex").slice(0, 12)}`;
  }
}

export function pullFile(pull: GitHubPull, name: string): string | undefined {
  if (name === "diff.patch") {
    return pull.diff;
  }
  if (name === "metadata.json") {
    return JSON.stringify(pullMetadata(pull));
  }
  return undefined;
}

