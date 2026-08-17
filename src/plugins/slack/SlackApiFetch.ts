import { SlackSettings } from "./SlackSettings";

export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ApiRequest {
  settings: SlackSettings;
  request: Fetch;
  timeoutMs: number;
}

export async function call(
  deps: ApiRequest,
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetchApi(deps, path, init);
  const body = (await response.json()) as Record<string, unknown>;
  return checked(path, body);
}

function checked(path: string, body: Record<string, unknown>) {
  if (body.ok !== true) {
    throw new Error(
      `Slack API request failed: ${path} -> ${String(body.error)}`,
    );
  }
  return body;
}

function fetchApi(deps: ApiRequest, path: string, init: RequestInit) {
  const url = `${deps.settings.apiUrl}/${path}`;
  const signal = AbortSignal.timeout(deps.timeoutMs);
  const headers = authHeaders(deps.settings);
  return deps
    .request(url, { ...init, headers, signal })
    .catch((error: unknown) => rethrow(error, url, deps.timeoutMs));
}

function authHeaders(settings: SlackSettings) {
  return {
    authorization: `Bearer ${settings.token}`,
    "content-type": "application/json",
  };
}

function rethrow(error: unknown, url: string, timeoutMs: number): never {
  throw timedOut(error)
    ? new Error(`Slack API request timed out after ${timeoutMs}ms: ${url}`)
    : (error as Error);
}

function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
