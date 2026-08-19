import { GitHubCommit } from "./GitHubCollectionSource";

export function commitMetadata(commit: GitHubCommit) {
  const { sha, author, authorName, message, date } = commit;
  const { htmlUrl, ciStatus } = commit;
  return { sha, author, authorName, message, date, htmlUrl, ciStatus };
}
