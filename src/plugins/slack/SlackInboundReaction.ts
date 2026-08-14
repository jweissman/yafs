import { SlackMessage } from "./SlackApiClient";
import { awaitReply, RunLookup } from "./SlackReplyWait";
import { RouteOptions, postIfReplied } from "./SlackInboundRouting";

// A backstop, not the expected turnaround. Reply-waiting runs detached from
// the poll loop (see routeMessage's `void reply(...)`), so this only bounds
// how long an abandoned watcher lingers in memory — it does not gate how
// many inbound messages can be dispatched, and it is never the reason a
// completed reply fails to post (a run that finishes after this fires is
// still sitting in its run artifact, just not auto-posted).
const REPLY_SAFETY_TIMEOUT_MS = 10 * 60_000;
const WORKING_REACTION = "eyes";

export function watch(
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

function logFailure(lookup: RunLookup, error: unknown) {
  console.error(
    `Slack reply for ${lookup.target.personaName} run ${lookup.runId} failed:`,
    error,
  );
}
