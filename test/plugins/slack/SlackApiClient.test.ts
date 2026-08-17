import { expect, test } from "bun:test";

import { SlackApiClient } from "../../../src/plugins/slack/SlackApiClient";
import { slackSettings } from "../../../src/plugins/slack/SlackSettings";

test("history requests the channel and limit, and returns the messages array", async () => {
  const requests: Request[] = [];
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch(requests, {
      ok: true,
      messages: [{ user: "U1", text: "hi", ts: "1.0" }],
    }),
  );
  const messages = await client.history("C123", 25);
  expect(messages).toEqual([{ user: "U1", text: "hi", ts: "1.0" }]);
  expect(requests[0].url).toBe(
    "https://slack.test/api/conversations.history?channel=C123&limit=25",
  );
  expect(requests[0].headers.get("authorization")).toBe("Bearer xoxb-1");
});

test("history defaults to an empty list when Slack omits the field", async () => {
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch([], { ok: true }),
  );
  expect(await client.history("C123", 25)).toEqual([]);
});

test("postMessage sends channel and text as a JSON body and returns the new timestamp", async () => {
  const requests: Request[] = [];
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch(requests, { ok: true, ts: "9.0" }),
  );
  expect(await client.postMessage("C123", "hello")).toBe("9.0");
  expect(await requests[0].json()).toEqual({ channel: "C123", text: "hello" });
});

test("identity returns the bot's own Slack user ID", async () => {
  const requests: Request[] = [];
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch(requests, { ok: true, user_id: "UBOT1" }),
  );
  expect(await client.identity()).toBe("UBOT1");
  expect(requests[0].url).toBe("https://slack.test/api/auth.test");
  expect(requests[0].method).toBe("POST");
});

test("addReaction posts channel/timestamp/name to reactions.add", async () => {
  const requests: Request[] = [];
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch(requests, { ok: true }),
  );
  await client.addReaction("C123", "1.0", "eyes");
  expect(requests[0].url).toBe("https://slack.test/api/reactions.add");
  expect(await requests[0].json()).toEqual({
    channel: "C123",
    timestamp: "1.0",
    name: "eyes",
  });
});

test("removeReaction posts channel/timestamp/name to reactions.remove", async () => {
  const requests: Request[] = [];
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch(requests, { ok: true }),
  );
  await client.removeReaction("C123", "1.0", "eyes");
  expect(requests[0].url).toBe("https://slack.test/api/reactions.remove");
  expect(await requests[0].json()).toEqual({
    channel: "C123",
    timestamp: "1.0",
    name: "eyes",
  });
});

test("a 200 response with ok:false is reported as a failure, not treated as success", async () => {
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    fakeFetch([], { ok: false, error: "channel_not_found" }),
  );
  await expect(client.postMessage("C123", "hi")).rejects.toThrow(
    "channel_not_found",
  );
});

test("a stalled request times out instead of hanging forever", async () => {
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    hangingFetch(),
    20,
  );
  await expect(client.postMessage("C123", "hi")).rejects.toThrow(
    "Slack API request timed out after 20ms",
  );
});

test("a non-timeout network error propagates as-is", async () => {
  const client = new SlackApiClient(
    { apiUrl: "https://slack.test/api", token: "xoxb-1" },
    async () => {
      throw new Error("ECONNREFUSED");
    },
  );
  await expect(client.postMessage("C123", "hi")).rejects.toThrow(
    "ECONNREFUSED",
  );
});

test("slackSettings requires a token and defaults to the standard endpoint", () => {
  expect(() => slackSettings({})).toThrow("YAFS_SLACK_TOKEN is required");
  const custom = slackSettings({
    YAFS_SLACK_TOKEN: "xoxb-2",
    YAFS_SLACK_API_URL: "https://slack.example/api/",
  });
  expect(custom).toEqual({
    apiUrl: "https://slack.example/api",
    token: "xoxb-2",
  });
});

function fakeFetch(requests: Request[], body: unknown) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return json(body);
  };
}

function hangingFetch() {
  return (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("signal timed out", "TimeoutError"));
      }),
    );
}

function json(value: unknown) {
  return new Response(JSON.stringify(value));
}
