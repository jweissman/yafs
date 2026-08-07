import { expect, test } from "bun:test";

import { ChatCompletionClient } from "../src/plugins/agent/ChatCompletionClient";

const API_URL = "http://localhost:1234/v1";
const MESSAGES = [{ role: "user", content: "message" }];

test("the chat completion client reports non-successful responses with the response body", async () => {
  const response = new Response("model not loaded", {
    status: 503,
    statusText: "Service Unavailable",
  });
  const failure = clientWith(async () => response).completeChat(MESSAGES);
  await expect(failure).rejects.toThrow("Chat completion request failed: 503");
  await expect(failure).rejects.toThrow("body: model not loaded");
});

test("the chat completion client times out a stalled request instead of hanging forever", async () => {
  const failure = clientWith(hangingFetch(), { timeoutMs: 20 }).completeChat(
    MESSAGES,
  );
  await expect(failure).rejects.toThrow(
    "Chat completion request timed out after 20ms",
  );
});

test("a non-2xx response whose body cannot be read still reports a failure instead of throwing raw", async () => {
  const failure = clientWith(unreadableFetch()).completeChat(MESSAGES);
  await expect(failure).rejects.toThrow("Chat completion request failed: 500");
});

test("a 200 response with an unexpected shape reports the raw body, not just a generic message", async () => {
  const failure = clientWith(async () => json({ ok: true })).completeChat(
    MESSAGES,
  );
  await expect(failure).rejects.toThrow('no message content: {"ok":true}');
});

test("a 200 response whose body is not SSE at all still reports the raw body", async () => {
  const body = "<html>gateway error</html>";
  const failure = clientWith(
    async () => new Response(body, { status: 200 }),
  ).completeChat(MESSAGES);
  await expect(failure).rejects.toThrow(`no message content: ${body}`);
});

test("a non-timeout connection failure propagates as-is instead of being relabeled", async () => {
  const failing = async () => {
    throw new Error("ECONNREFUSED");
  };
  await expect(clientWith(failing).completeChat(MESSAGES)).rejects.toThrow(
    "ECONNREFUSED",
  );
});

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function clientWith(
  fetch: Fetch,
  options: { model?: string; timeoutMs?: number } = {},
) {
  return new ChatCompletionClient(
    { apiUrl: API_URL, model: options.model },
    fetch,
    options.timeoutMs,
  );
}

function hangingFetch(): Fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("signal timed out", "TimeoutError")),
      ),
    );
}

function unreadableFetch(): Fetch {
  return async () =>
    ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => {
        throw new Error("stream closed");
      },
    }) as unknown as Response;
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}
