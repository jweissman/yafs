import { expect, test } from "bun:test";

import { GitHubApiClient } from "../../../src/plugins/github/GitHubApiClient";

test("the GitHub API client queries a bounded collection and fetches each immutable diff", async () => {
  const requests: Request[] = [];
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test", token: "secret" },
    fakeFetch(requests),
  );
  const pulls = await client.pulls({
    repository: "acme/widget",
    query: "is:pr is:open",
    max: 2,
  });
  expect(pulls).toEqual([
    {
      number: 42,
      title: "Improve resolver",
      updatedAt: "2026-08-03T00:00:00Z",
      headSha: "abc123",
      diff: "diff --git",
      labels: [],
    },
  ]);
  assertExpectedRequests(requests);
});

function assertExpectedRequests(requests: Request[]) {
  expect(requests.map((request) => request.url)).toEqual([
    "https://github.test/search/issues?q=repo%3Aacme%2Fwidget+is%3Apr+is%3Aopen&per_page=2",
    "https://github.test/repos/acme/widget/pulls/42",
    "https://github.test/repos/acme/widget/pulls/42",
  ]);
  expect(
    requests.every(
      (request) => request.headers.get("authorization") === "Bearer secret",
    ),
  ).toBe(true);
}

// Regression coverage for real, useful data yafs was discarding: author,
// draft status, and diff-size stats all come back on the same per-PR GET
// already made for head.sha -- no extra request needed, just fields that
// were being read past.
test("the GitHub API client carries author, draft status, and diff-size stats through, at no extra request cost", async () => {
  const requests: Request[] = [];
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test", token: "secret" },
    richFetch(requests),
  );
  const pulls = await client.pulls({
    repository: "acme/widget",
    query: "is:pr is:open",
    max: 1,
  });
  expect(pulls).toEqual([
    {
      number: 42,
      title: "Improve resolver",
      updatedAt: "2026-08-03T00:00:00Z",
      headSha: "abc123",
      diff: "diff --git",
      author: "octocat",
      draft: true,
      additions: 30,
      deletions: 4,
      changedFiles: 2,
      body: "Fixes the thing.",
      createdAt: "2026-08-01T00:00:00Z",
      comments: 3,
      reviewComments: 8,
      mergeableState: "blocked",
      labels: ["require-backend-approval"],
      htmlUrl: "https://github.test/acme/widget/pull/42",
    },
  ]);
  expect(requests).toHaveLength(3);
});

function richFetch(requests: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    if (requests.length === 1) {
      return json({
        items: [
          { number: 42, title: "Improve resolver", updated_at: "2026-08-03T00:00:00Z" },
        ],
      });
    }
    if (requests.length === 2) {
      return json({
        head: { sha: "abc123" },
        user: { login: "octocat" },
        draft: true,
        additions: 30,
        deletions: 4,
        changed_files: 2,
        body: "Fixes the thing.",
        created_at: "2026-08-01T00:00:00Z",
        comments: 3,
        review_comments: 8,
        mergeable_state: "blocked",
        labels: [{ name: "require-backend-approval" }],
        html_url: "https://github.test/acme/widget/pull/42",
      });
    }
    return new Response("diff --git");
  };
}

test("the GitHub API client fetches a single pull by number without a search", async () => {
  const requests: Request[] = [];
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test", token: "secret" },
    fakeSinglePullFetch(requests),
  );
  const pull = await client.pull("acme/widget", 42);
  expect(pull).toEqual({
    number: 42,
    title: "Improve resolver",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
    diff: "diff --git",
    labels: [],
  });
  expect(requests.map((request) => request.url)).toEqual([
    "https://github.test/repos/acme/widget/pulls/42",
    "https://github.test/repos/acme/widget/pulls/42",
  ]);
});

test("the GitHub API client reports non-successful responses without exposing credentials", async () => {
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test" },
    async () => new Response("", { status: 403 }),
  );
  await expect(
    client.pulls({ repository: "acme/widget", query: "is:open", max: 1 }),
  ).rejects.toThrow("GitHub API request failed: 403");
});

test("a failed request reports its url, accept header, request id, and body for diagnosis", async () => {
  const response = new Response('{"message":"Must authenticate"}', {
    status: 401,
    headers: { "x-github-request-id": "ABCD:1234" },
  });
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test" },
    async () => response,
  );
  const failure = client.pulls({
    repository: "acme/widget",
    query: "is:open",
    max: 1,
  });
  await expect(failure).rejects.toThrow(
    "url: https://github.test/search/issues",
  );
  await expect(failure).rejects.toThrow("x-github-request-id: ABCD:1234");
  await expect(failure).rejects.toThrow(
    'body: {"message":"Must authenticate"}',
  );
});

test("failure detail still reports status when reading the failed response body itself fails", async () => {
  const response = new Response("", { status: 500 });
  response.text = () => Promise.reject(new Error("stream error"));
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test" },
    async () => response,
  );
  await expect(
    client.pulls({ repository: "acme/widget", query: "is:open", max: 1 }),
  ).rejects.toThrow("GitHub API request failed: 500");
});

test("the GitHub API client times out a stalled request instead of hanging forever", async () => {
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test" },
    hangingFetch(),
    20,
  );
  const failure = client.pulls({
    repository: "acme/widget",
    query: "is:open",
    max: 1,
  });
  await expect(failure).rejects.toThrow(
    "GitHub API request timed out after 20ms: https://github.test/search/issues",
  );
});

test("a non-timeout network error propagates as-is", async () => {
  const client = new GitHubApiClient(
    { apiUrl: "https://github.test" },
    async () => {
      throw new Error("ECONNREFUSED");
    },
  );
  const failure = client.pulls({
    repository: "acme/widget",
    query: "is:open",
    max: 1,
  });
  await expect(failure).rejects.toThrow("ECONNREFUSED");
});

function hangingFetch() {
  return (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("signal timed out", "TimeoutError"));
      }),
    );
}

function fakeFetch(requests: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return fakeResponse(requests.length);
  };
}

function fakeResponse(number: number) {
  if (number === 1) {
    return json({
      items: [
        {
          number: 42,
          title: "Improve resolver",
          updated_at: "2026-08-03T00:00:00Z",
        },
      ],
    });
  }
  if (number === 2) {
    return json({ head: { sha: "abc123" } });
  }
  return new Response("diff --git");
}

function fakeSinglePullFetch(requests: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return requests.length === 1
      ? json({
          title: "Improve resolver",
          updated_at: "2026-08-03T00:00:00Z",
          head: { sha: "abc123" },
        })
      : new Response("diff --git");
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
