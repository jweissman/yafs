import { expect, test } from "bun:test";

import { fakeMessageModel, failingModel } from "../agent_model_fakes";
import {
  arrive,
  establishedBaseline,
  fakeState,
  sleep,
  startServer,
  waitFor,
} from "./slack_inbound_helpers";

test("a message that mentions the bot is routed and the reply is posted back", async () => {
  const state = fakeState([{ user: "BOT", text: "prior", ts: "1.0" }]);
  const collected: string[] = [];
  const { server, client } = await startServer(state, () =>
    fakeMessageModel(collected),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "<@BOT> please review", ts: "2.0" });
  await waitFor(() => state.posted.length > 0);
  expect(state.posted).toEqual([
    { channel: "C123", text: "reply-to-U1: please review" },
  ]);
  expect(collected).toEqual(["U1: please review"]);
  await client.close();
  await server.close();
});

test("a message that never mentions the bot is left alone, including on a fresh cursor", async () => {
  const state = fakeState([
    { user: "U1", text: "unrelated channel chatter", ts: "1.0" },
    { user: "U2", text: "more chatter, no mention", ts: "2.0" },
  ]);
  const { server, client } = await startServer(state, () =>
    fakeMessageModel([]),
  );
  await client.exec("plugins apply");
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

test("requireMention: false routes a message with no @mention", async () => {
  const state = fakeState([]);
  const collected: string[] = [];
  const { server, client } = await startServer(
    state,
    () => fakeMessageModel(collected),
    { requireMention: false },
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "please review, no mention", ts: "2.0" });
  await waitFor(() => state.posted.length > 0);
  expect(collected).toEqual(["U1: please review, no mention"]);
  await client.close();
  await server.close();
});

test("the poller never replies to the bot's own posted messages", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(state, () =>
    fakeMessageModel([]),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "BOT", text: "<@BOT> self echo", ts: "2.0" });
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});

test("a failed agent run is not posted back to Slack", async () => {
  const state = fakeState([]);
  const { server, client } = await startServer(state, () =>
    failingModel("boom"),
  );
  await client.exec("plugins apply");
  await establishedBaseline();
  arrive(state, { user: "U1", text: "<@BOT> trigger failure", ts: "2.0" });
  await sleep(150);
  expect(state.posted).toEqual([]);
  await client.close();
  await server.close();
});
