export type Failure = {
  url: string;
  accept: string;
  response: Response;
  body: string;
};

export function failureDetail(failure: Failure) {
  return failureLines(failure).join("\n");
}

function failureLines({ url, accept, response, body }: Failure) {
  return [
    `GitHub API request failed: ${response.status} ${response.statusText}`,
    `url: ${url}`,
    `accept: ${accept}`,
    ...requestId(response),
    ...bodyLine(body),
  ];
}

function requestId(response: Response) {
  const id = response.headers.get("x-github-request-id");
  return id ? [`x-github-request-id: ${id}`] : [];
}

function bodyLine(body: string) {
  return body ? [`body: ${body}`] : [];
}

export function timedOut(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}
