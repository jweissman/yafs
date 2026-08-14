export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchCompletion(
  request: Fetch,
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<Response> {
  const response = await requested(request, url, body, timeoutMs);
  return ok(url, response);
}

function requested(
  request: Fetch,
  url: string,
  body: unknown,
  timeoutMs: number,
) {
  return post(request, url, body, timeoutMs).catch((error) =>
    rethrow(error, url, timeoutMs),
  );
}

async function ok(url: string, response: Response): Promise<Response> {
  if (response.ok) {
    return response;
  }
  throw new Error(await failure(url, response));
}

function post(request: Fetch, url: string, body: unknown, timeoutMs: number) {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  };
  return request(url, init);
}

function rethrow(error: unknown, url: string, timeoutMs: number): never {
  throw timedOut(error)
    ? new Error(
        `Chat completion request timed out after ${timeoutMs}ms: ${url}`,
      )
    : (error as Error);
}

function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function failure(url: string, response: Response) {
  const body = await response.text().catch(() => "");
  return `Chat completion request failed: ${response.status} ${response.statusText}\nurl: ${url}\nbody: ${body}`;
}
