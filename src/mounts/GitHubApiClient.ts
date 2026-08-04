import { GitHubClient, GitHubPull, GitHubPullFetcher } from './GitHubCollectionSource'
import { GitHubConfig } from './types'
import { GitHubSettings } from './GitHubSettings'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type Search = { items: Array<{ number: number, title: string, updated_at: string }> }
type Pull = { head: { sha: string } }
type PullDetails = { title: string, updated_at: string, head: { sha: string } }

const DEFAULT_TIMEOUT_MS = 15_000

export class GitHubApiClient implements GitHubClient, GitHubPullFetcher {
  constructor(private readonly settings: GitHubSettings, private readonly request: Fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async pulls(config: GitHubConfig): Promise<GitHubPull[]> {
    const search = await this.json<Search>(this.searchUrl(config))
    return Promise.all(search.items.map(item => this.searchedPull(config.repository, item)))
  }

  async pull(repository: string, number: number): Promise<GitHubPull> {
    const url = `${this.settings.apiUrl}/repos/${repository}/pulls/${number}`
    const details = await this.json<PullDetails>(url); const diff = await this.text(url, 'application/vnd.github.diff')
    return { number, title: details.title, updatedAt: details.updated_at, headSha: details.head.sha, diff }
  }

  private async searchedPull(repository: string, item: Search['items'][number]): Promise<GitHubPull> {
    const url = `${this.settings.apiUrl}/repos/${repository}/pulls/${item.number}`
    const details = await this.json<Pull>(url); const diff = await this.text(url, 'application/vnd.github.diff')
    return { number: item.number, title: item.title, updatedAt: item.updated_at, headSha: details.head.sha, diff }
  }

  private searchUrl(config: GitHubConfig) {
    const query = new URLSearchParams({ q: `repo:${config.repository} ${config.query}`, per_page: String(config.max) })
    return `${this.settings.apiUrl}/search/issues?${query}`
  }

  private async json<T>(url: string) { return (await this.response(url, 'application/vnd.github+json')).json() as Promise<T> }
  private async text(url: string, accept: string) { return (await this.response(url, accept)).text() }
  private async response(url: string, accept: string) {
    const response = await this.fetch(url, accept)
    if (!response.ok) throw new Error(await this.failure(url, accept, response))
    return response
  }
  private async fetch(url: string, accept: string) {
    const signal = AbortSignal.timeout(this.timeoutMs)
    try { return await this.request(url, { headers: this.headers(accept), signal }) }
    catch (error) { throw timedOut(error) ? new Error(`GitHub API request timed out after ${this.timeoutMs}ms: ${url}`) : error }
  }
  private async failure(url: string, accept: string, response: Response) {
    const body = await response.text().catch(() => '')
    return failureDetail(url, accept, response, body)
  }
  private headers(accept: string) {
    return { accept, ...(this.settings.token ? { authorization: `Bearer ${this.settings.token}` } : {}) }
  }
}

function failureDetail(url: string, accept: string, response: Response, body: string) {
  const lines = [`GitHub API request failed: ${response.status} ${response.statusText}`,
    `url: ${url}`, `accept: ${accept}`, ...requestId(response), ...bodyLine(body)]
  return lines.join('\n')
}

function requestId(response: Response) {
  const id = response.headers.get('x-github-request-id'); return id ? [`x-github-request-id: ${id}`] : []
}

function bodyLine(body: string) {
  return body ? [`body: ${body}`] : []
}

function timedOut(error: unknown) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}
