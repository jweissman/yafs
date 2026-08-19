export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export interface Search {
  items: { number: number; title: string; updated_at: string }[];
}

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
export interface CommitListItem {
  sha: string;
  commit: { author: { name: string; date: string } | null; message: string };
  author: { login: string } | null;
  html_url: string;
}
export interface CheckRun {
  status: string;
  conclusion: string | null;
}
export interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}
export type CiStatus = "success" | "failure" | "pending" | "none";
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
