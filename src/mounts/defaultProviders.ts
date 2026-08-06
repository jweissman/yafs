import { GitHubApiClient } from './GitHubApiClient'
import { GitHubCollectionSource } from './GitHubCollectionSource'
import { githubSettings } from './GitHubSettings'
import { defaultSlackClient } from './SlackApiClient'
import { SlackCollectionSource } from './SlackCollectionSource'
import { ProviderRegistry } from './ProviderRegistry'

export function defaultProviders() {
  const settings = githubSettings()
  const github = new GitHubCollectionSource(new GitHubApiClient({ apiUrl: settings.apiUrl }))
  return new ProviderRegistry(github, authenticated(settings), slackSource())
}

function authenticated(settings: import('./GitHubSettings').GitHubSettings) {
  return settings.token ? new GitHubCollectionSource(new GitHubApiClient(settings)) : undefined
}

function slackSource() {
  try { return new SlackCollectionSource(defaultSlackClient()) } catch { return undefined }
}
