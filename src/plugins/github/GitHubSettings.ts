export type GitHubSettings = { apiUrl: string; token?: string };

export function githubSettings(environment = process.env): GitHubSettings {
  const apiUrl = resolvedApiUrl(environment);
  if (!apiUrl.startsWith("https://")) {
    throw new Error("YAFS_GITHUB_API_URL must use https");
  }
  return {
    apiUrl: apiUrl.replace(/\/$/, ""),
    token: environment.YAFS_GITHUB_TOKEN,
  };
}

function resolvedApiUrl(environment: NodeJS.ProcessEnv) {
  return (
    environment.YAFS_GITHUB_API_URL ||
    apiUrlForHost(environment.YAFS_GITHUB_HOST || "github.com")
  );
}

function apiUrlForHost(host: string) {
  if (host === "github.com") {
    return "https://api.github.com";
  }
  return host.endsWith(".ghe.com")
    ? `https://api.${host}`
    : `https://${host}/api/v3`;
}
