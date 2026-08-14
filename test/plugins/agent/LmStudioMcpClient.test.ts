import { expect, test } from "bun:test";

import {
  finalMessage,
  LmStudioMcpClient,
} from "../../../src/plugins/agent/LmStudioMcpClient";

const API_URL = "http://localhost:1234/api/v1";
const INTEGRATIONS = [
  { type: "plugin" as const, id: "mcp/yafs-agents-reviewer" },
];

test("sends input/system_prompt/integrations and parses message output", async () => {
  const requests: Request[] = [];
  const client = clientWith(fakeFetch(requests, jsonResponse()));
  const turn = await client.respond({
    input: "Review this PR",
    systemPrompt: "You are a terse reviewer.",
    integrations: INTEGRATIONS,
  });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe(`${API_URL}/chat`);
  const body = await requests[0].json();
  expect(body).toEqual({
    input: "Review this PR",
    system_prompt: "You are a terse reviewer.",
    integrations: INTEGRATIONS,
    stream: false,
  });
  expect(finalMessage(turn)).toBe("Looks fine.");
  expect(turn.responseId).toBe("resp_123");
});

test("passes previous_response_id when threading a conversation", async () => {
  const requests: Request[] = [];
  const client = clientWith(fakeFetch(requests, jsonResponse()));
  await client.respond({
    input: "Follow up",
    systemPrompt: "sys",
    integrations: INTEGRATIONS,
    previousResponseId: "resp_abc",
  });
  const body = (await requests[0].json()) as { previous_response_id?: string };
  expect(body.previous_response_id).toBe("resp_abc");
});

test("sends no Authorization header when no access token is configured", async () => {
  const requests: Request[] = [];
  const client = clientWith(fakeFetch(requests, jsonResponse()));
  await client.respond({
    input: "hi",
    systemPrompt: "sys",
    integrations: INTEGRATIONS,
  });
  expect(requests[0].headers.get("authorization")).toBeNull();
});

test("sends a Bearer Authorization header when an access token is configured", async () => {
  const requests: Request[] = [];
  const client = new LmStudioMcpClient(
    { apiUrl: API_URL, accessToken: "secret-token" },
    fakeFetch(requests, jsonResponse()),
  );
  await client.respond({
    input: "hi",
    systemPrompt: "sys",
    integrations: INTEGRATIONS,
  });
  expect(requests[0].headers.get("authorization")).toBe("Bearer secret-token");
});

test("finalMessage concatenates multiple message items and ignores tool calls", () => {
  const turn = {
    output: [
      { type: "reasoning" as const, content: "thinking" },
      {
        type: "tool_call" as const,
        tool: "yafs.read",
        arguments: {},
        output: "file contents",
      },
      { type: "message" as const, content: "First part." },
      { type: "message" as const, content: "Second part." },
    ],
  };
  expect(finalMessage(turn)).toBe("First part.\n\nSecond part.");
});

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function clientWith(fetch: Fetch) {
  return new LmStudioMcpClient({ apiUrl: API_URL }, fetch);
}

function fakeFetch(requests: Request[], response: Response) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return response;
  };
}

function jsonResponse() {
  return new Response(
    JSON.stringify({
      output: [{ type: "message", content: "Looks fine." }],
      response_id: "resp_123",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
