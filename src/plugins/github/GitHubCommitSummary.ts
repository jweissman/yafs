import { CiStatus, CommitListItem } from "./GitHubApiClientTypes";
import { GitHubCommit } from "./GitHubCollectionSource";

export function commitSummary(
  item: CommitListItem,
  ciStatus: CiStatus,
): GitHubCommit {
  return { ...identity(item), ...content(item), ciStatus };
}

function identity(item: CommitListItem) {
  const { sha, author, html_url: htmlUrl } = item;
  return { sha, author: author?.login, htmlUrl };
}

function content(item: CommitListItem) {
  const { commit } = item;
  const { name: authorName, date } = commit.author ?? {};
  return { authorName, date, message: commit.message };
}
