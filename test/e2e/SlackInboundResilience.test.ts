import { expect, test } from "bun:test";

import { ModelClient } from "../../src/plugins/agent/ChatCompletionClient";
import { fakeMessageModel, slowModel } from "../agent_model_fakes";
import {
  arrive,
  establishedBaseline,
  fakeState,
  sleep,
  startServer,
  waitFor,
} from "./slack_inbound_helpers";

test("a poll failure for one tick does not stop later ticks from routing", async () => {
  const state = fakeState([]);
  const collected: string[] = [];
  const { server, client } = await startServer(state, () =>
    fakeMessageModel(collected),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  state.failNextHistory = true;
  await waitFor(() => !state.failNextHistory, 2000);
  arrive(state, { user: "U1", text: "<@BOT> please review", ts: "2.0" });
  await waitFor(() => state.posted.length > 0);
  expect(collected).toEqual(["U1: please review"]);
  await client.close();
  await server.close();
});

test("a slow reply does not block a later poll tick from dispatching the next message", async () => {
  const state = fakeState([]);
  const starts: number[] = [];
  const { server, client } = await startServer(state, () =>
    timingModel(500, starts),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "<@BOT> first", ts: "2.0" });
  await waitFor(() => starts.length > 0);
  arrive(state, { user: "U2", text: "<@BOT> second", ts: "3.0" });
  // Must start well before the first model call's 500ms delay resolves —
  // proves the poll loop wasn't blocked awaiting the first reply.
  await waitFor(() => starts.length > 1, 300);
  expect(starts[1] - starts[0]).toBeLessThan(300);
  await client.close();
  await server.close();
});

test("a reply that never completes within replyTimeoutMs is abandoned and logged, not silently lost", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(
    state,
    () => slowModel("done", 2000),
    { replyTimeoutMs: 50 },
  );
  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await client.exec("plugins apply");
    await establishedBaseline();
    arrive(state, { user: "U1", text: "<@BOT> please review", ts: "2.0" });
    await waitFor(() => errors.some(loggedAbandon), 2000);
  } finally {
    console.error = originalError;
  }
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

function loggedAbandon(args: unknown[]): boolean {
  return typeof args[0] === "string" && args[0].includes("reply abandoned");
}

function timingModel(delayMs: number, starts: number[]): ModelClient {
  return { completeChat: () => record(delayMs, starts) };
}

async function record(delayMs: number, starts: number[]) {
  starts.push(Date.now());
  await sleep(delayMs);
  return "done";
}
