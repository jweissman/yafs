import { GitHubConfig } from "../../mounts/types";
import { GitHubCommit } from "./GitHubCollectionSource";
import { CheckRunsResponse, CommitListItem } from "./GitHubApiClientTypes";
import { apiJson, ApiRequest } from "./GitHubApiFetch";
import { combinedCiStatus } from "./GitHubCiStatus";
import { commitSummary } from "./GitHubCommitSummary";

const DEFAULT_COMMIT_COUNT = 12;

export async function fetchCommits(
  deps: ApiRequest,
  config: GitHubConfig,
): Promise<GitHubCommit[]> {
  const url = commitsUrl(deps, config);
  const list = await apiJson<CommitListItem[]>(deps, url);
  return Promise.all(list.map((item) => commitResult(deps, config, item)));
}

function commitsUrl(deps: ApiRequest, config: GitHubConfig) {
  const count = config.commits?.max ?? DEFAULT_COMMIT_COUNT;
  const query = new URLSearchParams({ per_page: String(count) });
  return `${deps.settings.apiUrl}/repos/${config.repository}/commits?${query}`;
}

async function commitResult(
  deps: ApiRequest,
  config: GitHubConfig,
  item: CommitListItem,
): Promise<GitHubCommit> {
  const ciStatus = await ciStatusFor(deps, config.repository, item.sha);
  return commitSummary(item, ciStatus);
}

async function ciStatusFor(deps: ApiRequest, repository: string, sha: string) {
  const url = checkRunsUrl(deps, repository, sha);
  const response = await apiJson<CheckRunsResponse>(deps, url);
  return combinedCiStatus(response.check_runs);
}

function checkRunsUrl(deps: ApiRequest, repository: string, sha: string) {
  const path = `repos/${repository}/commits/${sha}/check-runs`;
  return `${deps.settings.apiUrl}/${path}?per_page=100`;
}
