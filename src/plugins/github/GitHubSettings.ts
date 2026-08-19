export interface GitHubSettings {
  apiUrl: string;
  webUrl: string;
  token?: string;
}

export function githubSettings(environment = process.env): GitHubSettings {
  const host = environment.YAFS_GITHUB_HOST ?? "github.com";
  const apiUrl = resolvedApiUrl(environment, host);
  assertHttps(apiUrl);
  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    webUrl: environment.YAFS_GITHUB_WEB_URL ?? `https://${host}`,
    token: environment.YAFS_GITHUB_TOKEN,
  };
}

function assertHttps(apiUrl: string) {
  if (!apiUrl.startsWith("https://")) {
    throw new Error("YAFS_GITHUB_API_URL must use https");
  }
}

function resolvedApiUrl(environment: NodeJS.ProcessEnv, host: string) {
  return environment.YAFS_GITHUB_API_URL ?? apiUrlForHost(host);
}

function apiUrlForHost(host: string) {
  if (host === "github.com") {
    return "https://api.github.com";
  }
  return host.endsWith(".ghe.com")
    ? `https://api.${host}`
    : `https://${host}/api/v3`;
}
