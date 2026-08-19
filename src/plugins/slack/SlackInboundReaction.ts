import { SlackMessage } from "./SlackApiClient";
import { log } from "../../Logging";
import { awaitReply, RunLookup } from "./SlackReplyWait";
import { RouteOptions, postIfReplied } from "./SlackInboundRouting";

const reactionLog = log.getSubLogger({ name: "slack.reaction" });

const REPLY_SAFETY_TIMEOUT_MS = 10 * 60_000;
const WORKING_REACTION = "eyes";

export function watch(
  lookup: RunLookup,
  options: RouteOptions,
  message: SlackMessage,
) {
  const action = () => reply(lookup, options);
  void withReaction(options, message, action).catch((error: unknown) => {
    logFailure(lookup, error);
  });
}

function withReaction(
  options: RouteOptions,
  message: SlackMessage,
  action: () => Promise<void>,
) {
  return options.reactionsEnabled
    ? reactedAction(options, message, action)
    : action();
}

async function reactedAction(
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
  await action().catch((error: unknown) => {
    logReactionFailure(error);
  });
}

function logReactionFailure(error: unknown) {
  reactionLog.error(
    { error: errorMessage(error) },
    "Slack reaction update failed",
  );
}

function logFailure(lookup: RunLookup, error: unknown) {
  const { personaName } = lookup.target;
  reactionLog.error(
    { personaName, runId: lookup.runId, error: errorMessage(error) },
    "Slack reply failed",
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
