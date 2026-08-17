import { Pull, PullSummary } from "./GitHubApiClientTypes";

export function searchSummary(
  item: { number: number; title: string; updated_at: string },
  details: Pull,
): PullSummary {
  const { number, title, updated_at: updatedAt } = item;
  return { number, title, updatedAt, ...pullFields(details) };
}

export function pullFields(details: Pull) {
  return { ...coreFields(details), ...activityFields(details) };
}

function coreFields(details: Pull) {
  return { ...identityFields(details), ...sizeFields(details) };
}

function identityFields(details: Pull) {
  const { head, user, draft } = details;
  return { headSha: head.sha, author: user?.login, draft };
}

function sizeFields(details: Pull) {
  const { additions, deletions, changed_files: changedFiles } = details;
  return { additions, deletions, changedFiles };
}

function activityFields(details: Pull) {
  return { ...contentFields(details), ...reviewFields(details) };
}

function contentFields(details: Pull) {
  const { body, created_at: createdAt } = details;
  const { comments, review_comments: reviewComments } = details;
  return { body: body ?? undefined, createdAt, comments, reviewComments };
}

// Defensive on labels, not just type-driven: unlike the other fields
// here (which degrade harmlessly to undefined if a response omits one),
// .map() on an absent labels array would throw instead -- a real crash
// this session's own test fixtures surfaced once the field was added.
function reviewFields(details: Pull) {
  const { mergeable_state: mergeableState, html_url: htmlUrl } = details;
  const labels = (details.labels ?? []).map((label) => label.name);
  return { mergeableState, labels, htmlUrl };
}
