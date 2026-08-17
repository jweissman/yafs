export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export interface Search {
  items: { number: number; title: string; updated_at: string }[];
}
// All of these come back on the same per-PR GET already made for
// head.sha -- no extra request needed to capture them, just fields that
// were being read and discarded. mergeable_state in particular is the
// cheapest available proxy for "is this actually ready" (blocked/dirty/
// unstable/clean) short of the real per-check CI log, which needs a
// genuinely different, on-demand fetch architecture (see
// FEATURE-ROADMAP.md's "Later: on-demand, single-resource provider
// fetch") -- this doesn't replace that, it's what's free in the meantime.
export interface PullFields {
  head: { sha: string };
  user: { login: string } | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  body: string | null;
  created_at: string;
  comments: number;
  review_comments: number;
  mergeable_state: string;
  labels?: { name: string }[];
  html_url: string;
}
export type Pull = PullFields;
export interface PullDetails extends PullFields {
  title: string;
  updated_at: string;
}
export interface PullSummary {
  number: number;
  title: string;
  updatedAt: string;
  headSha: string;
  author?: string;
  draft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  body?: string;
  createdAt: string;
  comments: number;
  reviewComments: number;
  mergeableState?: string;
  labels: string[];
  htmlUrl: string;
}
