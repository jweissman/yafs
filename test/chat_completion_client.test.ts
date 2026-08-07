import { expect, test } from "bun:test";

import {
  ChatCompletionClient,
  chatCompletionClientFor,
} from "../src/plugins/agent/ChatCompletionClient";
import { chatCompletionSettings } from "../src/plugins/agent/ChatCompletionSettings";

const API_URL = "http://localhost:1234/v1";

test("the chat completion client sends a system/user request and returns the completion text", async () => {
  const requests: Request[] = [];
  const client = clientWith(fakeFetch(requests), { model: "local-model" });
  const reply = await client.complete(
    "You are a helpful reviewer.",
    "Summarize this diff.",
  );
  expect(reply).toBe("Looks good to me.");
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(`${API_URL}/chat/completions`);
  const body = await requests[0].json();
  expect(body).toEqual({
    model: "local-model",
    messages: [
      { role: "system", content: "You are a helpful reviewer." },
      { role: "user", content: "Summarize this diff." },
    ],
  });
});

test("the chat completion client omits model when none is configured", async () => {
  const requests: Request[] = [];
  await clientWith(fakeFetch(requests)).complete("system", "message");
  const body = (await requests[0].json()) as { model?: string };
  expect(body.model).toBeUndefined();
});

test("the chat completion client reports non-successful responses with the response body", async () => {
  const response = new Response("model not loaded", {
    status: 503,
    statusText: "Service Unavailable",
  });
  const failure = clientWith(async () => response).complete(
    "system",
    "message",
  );
  await expect(failure).rejects.toThrow("Chat completion request failed: 503");
  await expect(failure).rejects.toThrow("body: model not loaded");
});

test("the chat completion client times out a stalled request instead of hanging forever", async () => {
  const failure = clientWith(hangingFetch(), { timeoutMs: 20 }).complete(
    "system",
    "message",
  );
  await expect(failure).rejects.toThrow(
    "Chat completion request timed out after 20ms",
  );
});

test("a non-2xx response whose body cannot be read still reports a failure instead of throwing raw", async () => {
  const failure = clientWith(unreadableFetch()).complete("system", "message");
  await expect(failure).rejects.toThrow("Chat completion request failed: 500");
});

test("a 200 response with an unexpected shape reports the raw body, not just a generic message", async () => {
  const failure = clientWith(async () => json({ ok: true })).complete(
    "system",
    "message",
  );
  await expect(failure).rejects.toThrow('no message content: {"ok":true}');
});

test("a 200 response whose body is not JSON at all still reports the raw body", async () => {
  const body = "<html>gateway error</html>";
  const failure = clientWith(
    async () => new Response(body, { status: 200 }),
  ).complete("s", "m");
  await expect(failure).rejects.toThrow(`no message content: ${body}`);
});

test("a non-timeout connection failure propagates as-is instead of being relabeled", async () => {
  const failing = async () => {
    throw new Error("ECONNREFUSED");
  };
  await expect(
    clientWith(failing).complete("system", "message"),
  ).rejects.toThrow("ECONNREFUSED");
});

test("chatCompletionSettings defaults to the standard local endpoint and honors env overrides", () => {
  expect(chatCompletionSettings({})).toEqual({
    apiUrl: API_URL,
    model: undefined,
  });
  const env = {
    YAFS_LLM_BASE_URL: "http://elsewhere:9999/v1/",
    YAFS_LLM_MODEL: "llama",
  };
  expect(chatCompletionSettings(env)).toEqual({
    apiUrl: "http://elsewhere:9999/v1",
    model: "llama",
  });
});

test("chatCompletionClientFor prefers persona config, then mount config, then the env default", () => {
  const mount = { endpoint: "http://mount:1/v1", model: "b" };
  const persona = chatCompletionClientFor(
    { prompt: "p", endpoint: "http://persona:1/v1", model: "a" },
    mount,
  );
  expect(persona).toBeInstanceOf(ChatCompletionClient);
  const mountFallback = chatCompletionClientFor({ prompt: "p" }, mount);
  expect(mountFallback).toBeInstanceOf(ChatCompletionClient);
  const envFallback = chatCompletionClientFor({ prompt: "p" }, {});
  expect(envFallback).toBeInstanceOf(ChatCompletionClient);
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

function fakeFetch(requests: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return json({ choices: [{ message: { content: "Looks good to me." } }] });
  };
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
