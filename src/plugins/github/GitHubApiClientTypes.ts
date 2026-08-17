export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export interface Search {
  items: { number: number; title: string; updated_at: string }[];
}
export interface Pull {
  head: { sha: string };
}
export interface PullDetails {
  title: string;
  updated_at: string;
  head: { sha: string };
}
export interface PullSummary {
  number: number;
  title: string;
  updatedAt: string;
  headSha: string;
}
