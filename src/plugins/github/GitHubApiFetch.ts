import { GitHubSettings } from "./GitHubSettings";
import { failureDetail, timedOut } from "./GitHubApiFailure";
import { Fetch } from "./GitHubApiClientTypes";

export type ApiRequest = {
  settings: GitHubSettings;
  request: Fetch;
  timeoutMs: number;
};

export async function apiJson<T>(deps: ApiRequest, url: string): Promise<T> {
  const res = await response(deps, url, "application/vnd.github+json");
  return res.json() as Promise<T>;
}

export async function apiText(
  deps: ApiRequest,
  url: string,
  accept: string,
): Promise<string> {
  return (await response(deps, url, accept)).text();
}

async function response(deps: ApiRequest, url: string, accept: string) {
  const res = await fetchWithTimeout(deps, url, accept);
  if (!res.ok) {
    throw new Error(await failure(url, accept, res));
  }
  return res;
}

async function fetchWithTimeout(deps: ApiRequest, url: string, accept: string) {
  const signal = AbortSignal.timeout(deps.timeoutMs);
  const init = { headers: headers(deps.settings, accept), signal };
  try {
    return await deps.request(url, init);
  } catch (error) {
    throw timeoutError(error, url, deps.timeoutMs) ?? error;
  }
}

function timeoutError(error: unknown, url: string, timeoutMs: number) {
  return timedOut(error)
    ? new Error(`GitHub API request timed out after ${timeoutMs}ms: ${url}`)
    : undefined;
}

async function failure(url: string, accept: string, response: Response) {
  const body = await response.text().catch(() => "");
  return failureDetail({ url, accept, response, body });
}

function headers(settings: GitHubSettings, accept: string) {
  return {
    accept,
    ...(settings.token ? { authorization: `Bearer ${settings.token}` } : {}),
  };
}
