import { createHash } from 'node:crypto'

import { GitHubConfig } from './types'

export type GitHubPull = {
  number: number, title: string, updatedAt: string, headSha: string, diff: string
}
export type GitHubClient = { pulls(config: GitHubConfig): Promise<GitHubPull[]> }
export type ProviderSnapshot = { entries: [string, string][], revision: string, fetchedAt: string }

export class GitHubCollectionSource {
  constructor(private readonly client: GitHubClient) {}

  async snapshot(config: GitHubConfig): Promise<ProviderSnapshot> {
    const pulls = await this.client.pulls(config)
    return { entries: this.entries(pulls), revision: this.revision(pulls), fetchedAt: new Date().toISOString() }
  }

  private entries(pulls: GitHubPull[]) { return pulls.flatMap(pull => this.pullEntries(pull)) }
  private pullEntries(pull: GitHubPull): [string, string][] {
    const root = `pulls/${pull.number}`
    return [[`${root}/diff.patch`, pull.diff], [`${root}/metadata.json`, JSON.stringify(this.metadata(pull))]]
  }
  private metadata(pull: GitHubPull) {
    return { number: pull.number, title: pull.title, updatedAt: pull.updatedAt, headSha: pull.headSha }
  }
  private revision(pulls: GitHubPull[]) { return `github:${createHash('sha256').update(JSON.stringify(pulls)).digest('hex').slice(0, 12)}` }
}
