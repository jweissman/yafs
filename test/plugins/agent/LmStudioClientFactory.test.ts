import { expect, test } from "bun:test";

import { lmStudioMcpClientFor } from "../../../src/plugins/agent/LmStudioClientFactory";
import { LmStudioMcpClient } from "../../../src/plugins/agent/LmStudioMcpClient";
import { parseJson } from "../../json";

const TOOLS = { roots: ["/home/root/traces/pr"] };

test("lmStudioMcpClientFor prefers persona config, then mount, then default", () => {
  const mount = { endpoint: "http://mount:1/api/v1", model: "b" };
  const persona = lmStudioMcpClientFor(
    {
      prompt: "p",
      endpoint: "http://persona:1/api/v1",
      model: "a",
      tools: TOOLS,
    },
    mount,
  );
  expect(persona).toBeInstanceOf(LmStudioMcpClient);
  const mountFallback = lmStudioMcpClientFor(
    { prompt: "p", tools: TOOLS },
    mount,
  );
  expect(mountFallback).toBeInstanceOf(LmStudioMcpClient);
});

test("lmStudioMcpClientFor falls back to the default local endpoint", () => {
  const client = lmStudioMcpClientFor(
    { prompt: "p", tools: TOOLS },
    { model: "a-model" },
  );
  expect(client).toBeInstanceOf(LmStudioMcpClient);
});

test("lmStudioMcpClientFor fails fast, before any request, when no model resolves anywhere", () => {
  expect(() =>
    lmStudioMcpClientFor({ prompt: "p", tools: TOOLS }, {}, {}),
  ).toThrow("No model resolved for this tool-enabled persona");
});

test("lmStudioMcpClientFor falls back to YAFS_LMSTUDIO_MODEL when neither persona nor mount set a model", async () => {
  const calls: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(calls) as typeof fetch;
  try {
    const client = lmStudioMcpClientFor(
      { prompt: "p", tools: TOOLS },
      {},
      { YAFS_LMSTUDIO_MODEL: "qwen2.5-7b-instruct" },
    );
    await client.respond({ input: "hi", systemPrompt: "s", integrations: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(modelOf(calls[0])).toBe("qwen2.5-7b-instruct");
});

test("lmStudioMcpClientFor threads YAFS_LMSTUDIO_ACCESS_TOKEN into the Authorization header", async () => {
  const calls: RequestInit[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch(calls) as typeof fetch;
  try {
    const client = lmStudioMcpClientFor(
      { prompt: "p", tools: TOOLS },
      {},
      { YAFS_LMSTUDIO_MODEL: "a-model", YAFS_LMSTUDIO_ACCESS_TOKEN: "tok" },
    );
    await client.respond({ input: "hi", systemPrompt: "s", integrations: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const headers = calls[0]?.headers as Record<string, string>;
  expect(headers.authorization).toBe("Bearer tok");
});

function fakeFetch(calls: RequestInit[]) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (!init) {
      throw new Error("Expected fetch options");
    }
    calls.push(init);
    return new Response(JSON.stringify({ output: [] }));
  };
}

function modelOf(request: RequestInit | undefined): unknown {
  if (typeof request?.body !== "string") {
    throw new Error("Expected body");
  }
  const value = parseJson(request.body);
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>).model
    : undefined;
}
