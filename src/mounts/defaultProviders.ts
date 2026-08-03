import { GitHubApiClient } from './GitHubApiClient'
import { GitHubCollectionSource } from './GitHubCollectionSource'
import { githubSettings } from './GitHubSettings'
import { ProviderRegistry } from './ProviderRegistry'

export function defaultProviders() {
  const settings = githubSettings()
  const github = new GitHubCollectionSource(new GitHubApiClient({ apiUrl: settings.apiUrl }))
  return new ProviderRegistry(github, authenticated(settings))
}

function authenticated(settings: import('./GitHubSettings').GitHubSettings) {
  return settings.token ? new GitHubCollectionSource(new GitHubApiClient(settings)) : undefined
}
