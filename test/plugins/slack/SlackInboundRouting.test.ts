import { expect, test } from "bun:test";

import { AbsolutePath } from "../../../src/core/AbsolutePath";
import {
  RouteOptions,
  routeMessage,
} from "../../../src/plugins/slack/SlackInboundRouting";
import {
  fakeDispatch,
  fakeMounts,
  waitFor,
} from "./slack_inbound_routing_helpers";
import { waitForLogEntry } from "../../logging_helpers";

test("waitFor times out when the condition never becomes true", async () => {
  await expect(waitFor(() => false, 30)).rejects.toThrow(
    "Timed out waiting for the condition",
  );
});

test("a dispatchCtl failure while posting the reply is logged, not left as an unhandled rejection", async () => {
  const entries: [string, string][] = [];
  const mounts = fakeMounts(entries);
  const personaCtlPath = "/home/root/agents/reviewer/ctl" as AbsolutePath;
  const slackCtlPath = "/home/root/updates/ctl" as AbsolutePath;
  const dispatchCtl = fakeDispatch(personaCtlPath, slackCtlPath, entries);
  const options: RouteOptions = {
    mounts,
    dispatchCtl,
    persona: "reviewer",
    slackCtlPath,
    botUserId: "BOT",
    replyTimeoutMs: 2000,
    reactionsEnabled: true,
    channel: "C123",
    client: {
      history: async () => [],
      identity: async () => "BOT",
      postMessage: async () => "9.0",
      addReaction: async () => undefined,
      removeReaction: async () => undefined,
    },
  };

  await routeMessage(options, "chat1", {
    user: "U1",
    text: "hello",
    ts: "1.0",
  });
  await waitForLogEntry(
    (entry) =>
      entry.message === "Slack reply failed" &&
      entry.personaName === "reviewer",
  );
});
