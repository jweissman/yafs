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

// The human-facing web host, unlike the API host, is the bare configured
// host in every real GitHub deployment shape yafs supports: github.com
// itself, a GHEC data-residency subdomain (<name>.ghe.com, API served
// from api.<name>.ghe.com but the web UI from the bare subdomain), and
// GitHub Enterprise Server (API under /api/v3, web at the bare host).
// Live-observed bug this fixes: citation links hardcoded github.com
// while the daemon's real repository is on a .ghe.com host.
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
