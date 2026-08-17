import { expect, test } from "bun:test";

import { AbsolutePath } from "../../../src/core/AbsolutePath";
import { SlackChannelClient } from "../../../src/plugins/slack/SlackApiClient";
import {
  RouteOptions,
  routeMessage,
} from "../../../src/plugins/slack/SlackInboundRouting";
import {
  fakeDispatch,
  fakeMounts,
  waitFor,
} from "./slack_inbound_routing_helpers";

test("a successful reply adds and removes the working reaction", async () => {
  const entries: [string, string][] = [];
  const mounts = fakeMounts(entries);
  const personaCtlPath = "/home/root/agents/reviewer/ctl" as AbsolutePath;
  const slackCtlPath = "/home/root/updates/ctl" as AbsolutePath;
  const dispatchCtl = fakeDispatch(personaCtlPath, slackCtlPath, entries, true);
  const reactions: [string, string, string][] = [];
  const options: RouteOptions = {
    mounts,
    dispatchCtl,
    persona: "reviewer",
    slackCtlPath,
    botUserId: "BOT",
    replyTimeoutMs: 2000,
    reactionsEnabled: true,
    channel: "C123",
    client: fakeClient(reactions),
  };

  await routeMessage(options, "chat1", { user: "U1", text: "hi", ts: "1.0" });
  await waitFor(() => reactions.length >= 2, 2000);
  expect(reactions).toEqual([
    ["add", "C123", "1.0"],
    ["remove", "C123", "1.0"],
  ]);
});

test("a reaction API failure is logged and does not block the reply", async () => {
  const entries: [string, string][] = [];
  const mounts = fakeMounts(entries);
  const personaCtlPath = "/home/root/agents/reviewer/ctl" as AbsolutePath;
  const slackCtlPath = "/home/root/updates/ctl" as AbsolutePath;
  const dispatchCtl = fakeDispatch(personaCtlPath, slackCtlPath, entries, true);
  const options: RouteOptions = {
    mounts,
    dispatchCtl,
    persona: "reviewer",
    slackCtlPath,
    botUserId: "BOT",
    replyTimeoutMs: 2000,
    reactionsEnabled: true,
    channel: "C123",
    client: failingReactionClient(),
  };

  const errors: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    await routeMessage(options, "chat1", { user: "U1", text: "hi", ts: "1.0" });
    await waitFor(() => errors.some(loggedReactionFailure), 2000);
  } finally {
    console.error = originalError;
  }
});

test("reactionsEnabled: false never calls the reaction API", async () => {
  const entries: [string, string][] = [];
  const mounts = fakeMounts(entries);
  const personaCtlPath = "/home/root/agents/reviewer/ctl" as AbsolutePath;
  const slackCtlPath = "/home/root/updates/ctl" as AbsolutePath;
  const dispatchCtl = fakeDispatch(personaCtlPath, slackCtlPath, entries, true);
  const reactions: [string, string, string][] = [];
  const options: RouteOptions = {
    mounts,
    dispatchCtl,
    persona: "reviewer",
    slackCtlPath,
    botUserId: "BOT",
    replyTimeoutMs: 2000,
    reactionsEnabled: false,
    channel: "C123",
    client: fakeClient(reactions),
  };

  await routeMessage(options, "chat1", { user: "U1", text: "hi", ts: "1.0" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(reactions).toEqual([]);
});

function fakeClient(reactions: [string, string, string][]): SlackChannelClient {
  return {
    history: async () => [],
    identity: async () => "BOT",
    postMessage: async () => "9.0",
    addReaction: async (channel, ts) => {
      reactions.push(["add", channel, ts]);
    },
    removeReaction: async (channel, ts) => {
      reactions.push(["remove", channel, ts]);
    },
  };
}

function failingReactionClient(): SlackChannelClient {
  return {
    history: async () => [],
    identity: async () => "BOT",
    postMessage: async () => "9.0",
    addReaction: async () => {
      throw new Error("reaction_rate_limited");
    },
    removeReaction: async () => {
      throw new Error("reaction_rate_limited");
    },
  };
}

function loggedReactionFailure(args: unknown[]): boolean {
  return (
    typeof args[0] === "string" && args[0].includes("reaction update failed")
  );
}
