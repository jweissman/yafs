import { GitHubSettings } from "../github/GitHubSettings";

export function gitRemoteUrl(
  settings: GitHubSettings,
  repository: string,
): string {
  const host = new URL(settings.webUrl).host;
  return `https://${host}/${repository}.git`;
}

export function gitAuthHeader(settings: GitHubSettings): string | undefined {
  if (!settings.token) {
    return undefined;
  }
  const encoded = Buffer.from(`x-access-token:${settings.token}`).toString(
    "base64",
  );
  return `AUTHORIZATION: basic ${encoded}`;
}
