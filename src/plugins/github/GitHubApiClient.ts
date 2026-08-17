import {
  GitHubClient,
  GitHubPull,
  GitHubPullFetcher,
} from "./GitHubCollectionSource";
import { GitHubConfig } from "../../mounts/types";
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

const DEFAULT_TIMEOUT_MS = 15_000;

// Only apiUrl/token are used for making requests -- webUrl exists
// purely for building human-facing citation links elsewhere and has no
// bearing on this client, so it isn't required here.
type ClientSettings = Pick<GitHubSettings, "apiUrl" | "token">;

export class GitHubApiClient implements GitHubClient, GitHubPullFetcher {
  constructor(
    private readonly settings: ClientSettings,
    private readonly request: Fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async pulls(config: GitHubConfig): Promise<GitHubPull[]> {
    const search = await this.json<Search>(this.searchUrl(config));
    return Promise.all(
      search.items.map((item) => this.searchedPull(config.repository, item)),
    );
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

  private searchUrl(config: GitHubConfig) {
    const query = new URLSearchParams({
      q: `repo:${config.repository} ${config.query}`,
      per_page: String(config.max),
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
