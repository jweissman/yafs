import { GitHubApiClient } from "../plugins/github/GitHubApiClient";
import { GitHubCollectionSource } from "../plugins/github/GitHubCollectionSource";
import { githubSettings } from "../plugins/github/GitHubSettings";
import { defaultSlackClient } from "../plugins/slack/SlackApiClient";
import { SlackCollectionSource } from "../plugins/slack/SlackCollectionSource";
import { ProviderRegistry } from "./ProviderRegistry";

export function defaultProviders() {
  const settings = githubSettings();
  const github = new GitHubCollectionSource(
    new GitHubApiClient({ apiUrl: settings.apiUrl }),
    settings.webUrl,
  );
  return new ProviderRegistry(github, authenticated(settings), slackSource());
}

function authenticated(
  settings: import("../plugins/github/GitHubSettings").GitHubSettings,
) {
  return settings.token
    ? new GitHubCollectionSource(new GitHubApiClient(settings), settings.webUrl)
    : undefined;
}

function slackSource() {
  try {
    return new SlackCollectionSource(defaultSlackClient());
  } catch {
    return undefined;
  }
}
