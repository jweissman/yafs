export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type Search = {
  items: Array<{ number: number; title: string; updated_at: string }>;
};
export type Pull = { head: { sha: string } };
export type PullDetails = {
  title: string;
  updated_at: string;
  head: { sha: string };
};
export type PullSummary = {
  number: number;
  title: string;
  updatedAt: string;
  headSha: string;
};
