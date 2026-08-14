import { randomUUID } from "node:crypto";

import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { resolvePersonaTarget } from "../agent/AgentPersonaLookup";
import { SlackChannelClient, SlackMessage } from "./SlackApiClient";
import { stripMention } from "./SlackInboundSchedule";
import { awaitReply, RunLookup } from "./SlackReplyWait";

export type DispatchCtl = (
  path: AbsolutePath,
  payload: string,
) => Promise<boolean>;

// Both legs of this route are ordinary ctl writes — the same primitive
// `agent send`/`slack send` reduce to once their command-line parsing is
// done. Routing the reply through the Slack mount's own ctl path (instead
// of calling the Slack client directly) reuses SlackDirectoryDriver's
// existing outbound handling rather than opening a second call site.
// Reactions go direct through `client` instead — they're a best-effort UI
// indicator, not a durable delivery, so they don't need the outbox.
export type RouteOptions = {
  mounts: MountManager;
  dispatchCtl: DispatchCtl;
  persona: string;
  slackCtlPath: AbsolutePath;
  botUserId: string;
  replyTimeoutMs?: number;
  client: SlackChannelClient;
  channel: string;
};

// A backstop, not the expected turnaround. Reply-waiting runs detached from
// the poll loop (see routeMessage's `void reply(...)`), so this only bounds
// how long an abandoned watcher lingers in memory — it does not gate how
// many inbound messages can be dispatched, and it is never the reason a
// completed reply fails to post (a run that finishes after this fires is
// still sitting in its run artifact, just not auto-posted).
const REPLY_SAFETY_TIMEOUT_MS = 10 * 60_000;
const WORKING_REACTION = "eyes";

export async function routeMessage(
  options: RouteOptions,
  chatId: string,
  message: SlackMessage,
) {
  const target = resolvePersonaTarget(options.mounts, options.persona);
  const runId = randomUUID();
  await dispatch(options, target.personaPath, chatId, message, runId);
  watch({ mounts: options.mounts, target, runId }, options, message);
}

function watch(
  lookup: RunLookup,
  options: RouteOptions,
  message: SlackMessage,
) {
  const action = () => reply(lookup, options);
  void withReaction(options, message, action).catch((error) =>
    logFailure(lookup, error),
  );
}

async function withReaction(
  options: RouteOptions,
  message: SlackMessage,
  action: () => Promise<void>,
) {
  await react(options, message);
  await action().finally(() => unreact(options, message));
}

async function reply(lookup: RunLookup, options: RouteOptions) {
  const timeoutMs = options.replyTimeoutMs ?? REPLY_SAFETY_TIMEOUT_MS;
  const text = await awaitReply(lookup, timeoutMs);
  await postIfReplied(options, text);
}

function react(options: RouteOptions, message: SlackMessage) {
  return safely(() =>
    options.client.addReaction(options.channel, message.ts, WORKING_REACTION),
  );
}

function unreact(options: RouteOptions, message: SlackMessage) {
  return safely(() =>
    options.client.removeReaction(
      options.channel,
      message.ts,
      WORKING_REACTION,
    ),
  );
}

async function safely(action: () => Promise<void>) {
  await action().catch((error) => logReactionFailure(error));
}

function logReactionFailure(error: unknown) {
  console.error("Slack reaction update failed:", error);
}

function dispatch(
  options: RouteOptions,
  personaPath: AbsolutePath,
  chatId: string,
  message: SlackMessage,
  runId: string,
) {
  const body = { message: content(options.botUserId, message), chatId, runId };
  return options.dispatchCtl(ctlPath(personaPath), JSON.stringify(body));
}

function content(botUserId: string, message: SlackMessage): string {
  const text = stripMention(botUserId, message.text);
  return `${message.user ?? "unknown"}: ${text}`;
}

function ctlPath(personaPath: AbsolutePath): AbsolutePath {
  return `${personaPath}/ctl` as AbsolutePath;
}

async function postIfReplied(options: RouteOptions, reply: string | undefined) {
  if (reply !== undefined) {
    const payload = JSON.stringify({ message: reply, actionId: randomUUID() });
    await options.dispatchCtl(options.slackCtlPath, payload);
  }
}

function logFailure(lookup: RunLookup, error: unknown) {
  console.error(
    `Slack reply for ${lookup.target.personaName} run ${lookup.runId} failed:`,
    error,
  );
}
