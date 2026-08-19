import { createHash } from "node:crypto";

import { GitHubConfig, GitHubPullsConfig } from "../../mounts/types";
import { pullMetadata } from "./GitHubPullMetadata";
import { commitEntries } from "./GitHubCommitEntries";
import { pullReferences } from "./GitHubPullReferences";
import { CiStatus } from "./GitHubApiClientTypes";

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
export interface GitHubCommit {
  sha: string;
  author?: string;
  authorName?: string;
  message: string;
  date?: string;
  htmlUrl: string;
  ciStatus: CiStatus;
}
export interface GitHubClient {
  pulls(repository: string, pulls: GitHubPullsConfig): Promise<GitHubPull[]>;

  commits?(config: GitHubConfig): Promise<GitHubCommit[]>;
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
    const pulls = await this.pulls(config);
    const commits = (await this.client.commits?.(config)) ?? [];
    return {
      entries: [...this.entries(pulls), ...commitEntries(commits)],
      revision: this.revision(pulls, commits),
      fetchedAt: new Date().toISOString(),
      resourceReferences: pullReferences(config, pulls, this.webUrl),
    };
  }

  private pulls({ repository, pulls }: GitHubConfig) {
    return pulls ? this.client.pulls(repository, pulls) : Promise.resolve([]);
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
  private revision(pulls: GitHubPull[], commits: GitHubCommit[]) {
    const payload = JSON.stringify({ pulls, commits });
    const digest = createHash("sha256").update(payload).digest("hex");
    return `github:${digest.slice(0, 12)}`;
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
