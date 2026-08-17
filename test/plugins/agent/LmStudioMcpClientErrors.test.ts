import { expect, test } from "bun:test";

import { LmStudioMcpClient } from "../../../src/plugins/agent/LmStudioMcpClient";

const API_URL = "http://localhost:1234/api/v1";
const TURN = { input: "hi", systemPrompt: "sys", integrations: [] };

test("reports non-successful responses with the response body", async () => {
  const response = new Response("model not loaded", {
    status: 503,
    statusText: "Service Unavailable",
  });
  const failure = clientWith(async () => response).respond(TURN);
  await expect(failure).rejects.toThrow("LM Studio chat request failed: 503");
  await expect(failure).rejects.toThrow("body: model not loaded");
});

test("times out a stalled request instead of hanging forever", async () => {
  const failure = clientWith(hangingFetch(), 20).respond(TURN);
  await expect(failure).rejects.toThrow(
    "LM Studio chat request timed out after 20ms",
  );
});

test("a non-2xx response whose body cannot be read still reports a failure", async () => {
  const failure = clientWith(unreadableFetch()).respond(TURN);
  await expect(failure).rejects.toThrow("LM Studio chat request failed: 500");
});

test("a non-timeout connection failure propagates as-is", async () => {
  const failing = async () => {
    throw new Error("ECONNREFUSED");
  };
  await expect(clientWith(failing).respond(TURN)).rejects.toThrow(
    "ECONNREFUSED",
  );
});

test("an output array missing response_id parses with responseId undefined", async () => {
  const response = new Response(
    JSON.stringify({ output: [{ type: "message", content: "ok" }] }),
    { headers: { "content-type": "application/json" } },
  );
  const turn = await clientWith(async () => response).respond(TURN);
  expect(turn.responseId).toBeUndefined();
});

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function clientWith(fetch: Fetch, timeoutMs?: number) {
  return new LmStudioMcpClient({ apiUrl: API_URL }, fetch, timeoutMs);
}

function hangingFetch(): Fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("signal timed out", "TimeoutError"));
      }),
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
