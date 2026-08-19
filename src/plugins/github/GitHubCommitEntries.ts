import { GitHubCommit } from "./GitHubCollectionSource";
import { commitMetadata } from "./GitHubCommitMetadata";

export function commitEntries(commits: GitHubCommit[]): [string, string][] {
  return [...commits.map((commit) => commitEntry(commit)), ...head(commits)];
}

function commitEntry(commit: GitHubCommit): [string, string] {
  return [`commits/${commit.sha}/metadata.json`, content(commit)];
}

function head(commits: GitHubCommit[]): [string, string][] {
  if (commits.length === 0) {
    return [];
  }
  return [["commits/HEAD/metadata.json", content(commits[0])]];
}

function content(commit: GitHubCommit): string {
  return JSON.stringify(commitMetadata(commit));
}
