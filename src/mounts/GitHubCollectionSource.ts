import { createHash } from "node:crypto";

import { GitHubConfig } from "./types";

export type GitHubPull = {
  number: number;
  title: string;
  updatedAt: string;
  headSha: string;
  diff: string;
};
export type GitHubClient = {
  pulls(config: GitHubConfig): Promise<GitHubPull[]>;
};
export type GitHubPullFetcher = {
  pull(repository: string, number: number): Promise<GitHubPull>;
};
export type ProviderSnapshot = {
  entries: [string, string][];
  revision: string;
  fetchedAt: string;
  resourceReferences: Record<string, object>;
};
export type GitHubResourceReference = {
  kind: "github-pr";
  repository: string;
  number: number;
  headSha: string;
};

export class GitHubCollectionSource {
  constructor(private readonly client: GitHubClient) {}

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
      [`${root}/diff.patch`, pullFile(pull, "diff.patch")!],
      [`${root}/metadata.json`, pullFile(pull, "metadata.json")!],
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
    return {
      kind: "github-pr",
      repository: config.repository,
      number: pull.number,
      headSha: pull.headSha,
    };
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
