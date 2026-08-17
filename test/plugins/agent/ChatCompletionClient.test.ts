import { expect, test } from "bun:test";

import {
  ChatCompletionClient,
  chatCompletionClientFor,
} from "../../../src/plugins/agent/ChatCompletionClient";
import { chatCompletionSettings } from "../../../src/plugins/agent/ChatCompletionSettings";
import { sse, sseFetch } from "../../sse_fixtures";

const API_URL = "http://localhost:1234/v1";
const MESSAGES = [
  { role: "system", content: "You are a helpful reviewer." },
  { role: "user", content: "Summarize this diff." },
];

test("the chat completion client sends a stream:true system/user request and returns the completion text", async () => {
  const requests: Request[] = [];
  const client = clientWith(fakeFetch(requests), { model: "local-model" });
  const reply = await client.completeChat(MESSAGES);
  expect(reply).toBe("Looks good to me.");
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(`${API_URL}/chat/completions`);
  expect(await requests[0].json()).toEqual({
    model: "local-model",
    messages: MESSAGES,
    stream: true,
  });
});

test("the chat completion client reassembles a multi-chunk SSE stream and reports deltas as they arrive", async () => {
  const deltas: string[] = [];
  const client = clientWith(sseFetch(["Looks ", "good ", "to me."]));
  const reply = await client.completeChat(MESSAGES, (delta) =>
    deltas.push(delta),
  );
  expect(reply).toBe("Looks good to me.");
  expect(deltas).toEqual(["Looks ", "good ", "to me."]);
});

test("the chat completion client omits model when none is configured", async () => {
  const requests: Request[] = [];
  await clientWith(fakeFetch(requests)).completeChat(MESSAGES);
  const body = (await requests[0].json()) as { model?: string };
  expect(body.model).toBeUndefined();
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
    return sse(["Looks good to me."]);
  };
}
