import { createHash } from "node:crypto";

import { GitHubConfig } from "../../mounts/types";

export interface GitHubPull {
  number: number;
  title: string;
  updatedAt: string;
  headSha: string;
  diff: string;
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
  private reference(
    config: GitHubConfig,
    pull: GitHubPull,
  ): GitHubResourceReference {
    const { number, headSha, title } = pull;
    const { repository } = config;
    const url = `${this.webUrl}/${repository}/pull/${String(number)}`;
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

function pullMetadata(pull: GitHubPull) {
  return {
    number: pull.number,
    title: pull.title,
    updatedAt: pull.updatedAt,
    headSha: pull.headSha,
  };
}
