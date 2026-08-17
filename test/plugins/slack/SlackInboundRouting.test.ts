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

test("waitFor times out when the condition never becomes true", async () => {
  await expect(waitFor(() => false, 30)).rejects.toThrow(
    "Timed out waiting for the condition",
  );
});

// The Slack outbound leg (SlackDirectoryDriver.send) durably queues via an
// outbox and delivers in the background (`void attemptDelivery(...)`), so a
// failing `postMessage` never surfaces as a rejection through `dispatchCtl`
// in a real end-to-end run. To exercise routeMessage's own failure-logging
// path (when dispatchCtl itself rejects), this fakes MountManager/dispatchCtl
// directly rather than going through the real Slack/agent plugin stack.
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

  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await routeMessage(options, "chat1", {
      user: "U1",
      text: "hello",
      ts: "1.0",
    });
    await waitFor(() => errors.some(loggedReplyFailure), 2000);
  } finally {
    console.error = originalError;
  }
});

function loggedReplyFailure(args: unknown[]): boolean {
  return (
    typeof args[0] === "string" &&
    args[0].includes("reply for") &&
    args[0].includes("failed:")
  );
}
