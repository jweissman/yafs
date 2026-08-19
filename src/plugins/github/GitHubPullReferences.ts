import { GitHubConfig } from "../../mounts/types";
import { GitHubPull, GitHubResourceReference } from "./GitHubCollectionSource";

export function pullReferences(
  config: GitHubConfig,
  pulls: GitHubPull[],
  webUrl: string,
): Record<string, GitHubResourceReference> {
  const entry = (pull: GitHubPull) =>
    [`pulls/${pull.number}`, reference(config, pull, webUrl)] as const;
  return Object.fromEntries(pulls.map(entry));
}

function reference(
  config: GitHubConfig,
  pull: GitHubPull,
  webUrl: string,
): GitHubResourceReference {
  const { number, headSha, title, htmlUrl } = pull;
  const { repository } = config;
  const url = htmlUrl ?? `${webUrl}/${repository}/pull/${String(number)}`;
  return { kind: "github-pr", repository, number, headSha, title, url };
}
