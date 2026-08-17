import { GitHubPull } from "./GitHubCollectionSource";

export function pullMetadata(pull: GitHubPull) {
  return { ...identityMetadata(pull), ...contentMetadata(pull) };
}

function identityMetadata(pull: GitHubPull) {
  return { ...coreIdentity(pull), ...sizeMetadata(pull) };
}

function coreIdentity(pull: GitHubPull) {
  const { number, title, updatedAt, createdAt, headSha, author } = pull;
  return { number, title, updatedAt, createdAt, headSha, author };
}

function sizeMetadata(pull: GitHubPull) {
  const { draft, additions, deletions, changedFiles } = pull;
  return { draft, additions, deletions, changedFiles };
}

function contentMetadata(pull: GitHubPull) {
  const { body, comments, reviewComments } = pull;
  const { mergeableState, labels, htmlUrl } = pull;
  return { body, comments, reviewComments, mergeableState, labels, htmlUrl };
}
