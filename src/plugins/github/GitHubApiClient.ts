import {
  GitHubClient,
  GitHubCommit,
  GitHubPull,
  GitHubPullFetcher,
} from "./GitHubCollectionSource";
import { GitHubConfig, GitHubPullsConfig } from "../../mounts/types";
import { GitHubSettings } from "./GitHubSettings";
import { pullFields, searchSummary } from "./GitHubApiSummary";
import {
  Fetch,
  Pull,
  PullDetails,
  PullSummary,
  Search,
} from "./GitHubApiClientTypes";
import { apiJson, apiText, ApiRequest } from "./GitHubApiFetch";
import { fetchCommits } from "./GitHubApiCommits";

const DEFAULT_TIMEOUT_MS = 15_000;

type ClientSettings = Pick<GitHubSettings, "apiUrl" | "token">;

export class GitHubApiClient implements GitHubClient, GitHubPullFetcher {
  constructor(
    private readonly settings: ClientSettings,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async pulls(
    repository: string,
    pulls: GitHubPullsConfig,
  ): Promise<GitHubPull[]> {
    const search = await this.json<Search>(this.searchUrl(repository, pulls));
    return Promise.all(
      search.items.map((item) => this.searchedPull(repository, item)),
    );
  }

  commits(config: GitHubConfig): Promise<GitHubCommit[]> {
    return fetchCommits(this.deps(), config);
  }

  async pull(repository: string, number: number): Promise<GitHubPull> {
    const url = this.pullUrl(repository, number);
    const details = await this.json<PullDetails>(url);
    return this.pullResult(url, {
      number,
      title: details.title,
      updatedAt: details.updated_at,
      ...pullFields(details),
    });
  }

  private async searchedPull(
    repository: string,
    item: Search["items"][number],
  ): Promise<GitHubPull> {
    const url = this.pullUrl(repository, item.number);
    const details = await this.json<Pull>(url);
    return this.pullResult(url, searchSummary(item, details));
  }

  private pullUrl(repository: string, number: number) {
    return `${this.settings.apiUrl}/repos/${repository}/pulls/${number}`;
  }

  private async pullResult(
    url: string,
    summary: PullSummary,
  ): Promise<GitHubPull> {
    const diff = await this.text(url, "application/vnd.github.diff");
    return { ...summary, diff };
  }

  private searchUrl(repository: string, pulls: GitHubPullsConfig) {
    const query = new URLSearchParams({
      q: `repo:${repository} ${pulls.query}`,
      per_page: String(pulls.max),
    });
    return `${this.settings.apiUrl}/search/issues?${query}`;
  }

  private json<T>(url: string) {
    return apiJson<T>(this.deps(), url);
  }
  private text(url: string, accept: string) {
    return apiText(this.deps(), url, accept);
  }
  private deps(): ApiRequest {
    const { settings, request, timeoutMs } = this;
    return { settings, request, timeoutMs };
  }
}
