import { randomUUID } from "node:crypto";

import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import {
  PersonaTarget,
  resolvePersonaTarget,
} from "../agent/AgentPersonaLookup";
import { SlackChannelClient, SlackMessage } from "./SlackApiClient";
import { stripMention } from "./SlackInboundSchedule";
import { watch } from "./SlackInboundReaction";

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
export interface RouteOptions {
  mounts: MountManager;
  dispatchCtl: DispatchCtl;
  persona: string;
  slackCtlPath: AbsolutePath;
  botUserId: string;
  replyTimeoutMs?: number;
  client: SlackChannelClient;
  channel: string;
  reactionsEnabled: boolean;
}

export async function routeMessage(
  options: RouteOptions,
  chatId: string,
  message: SlackMessage,
) {
  const target = resolvePersonaTarget(options.mounts, options.persona);
  const runId = randomUUID();
  await dispatch(options, dispatchRequest(target, chatId, message, runId));
  watch({ mounts: options.mounts, target, runId }, options, message);
}

function dispatchRequest(
  target: PersonaTarget,
  chatId: string,
  message: SlackMessage,
  runId: string,
): DispatchRequest {
  return { personaPath: target.personaPath, chatId, message, runId };
}

interface DispatchRequest {
  personaPath: AbsolutePath;
  chatId: string;
  message: SlackMessage;
  runId: string;
}

function dispatch(options: RouteOptions, request: DispatchRequest) {
  const { personaPath, chatId, message, runId } = request;
  const text = content(options.botUserId, message);
  logInbound(options.persona, runId, text);
  const body = { message: text, chatId, runId };
  return options.dispatchCtl(ctlPath(personaPath), JSON.stringify(body));
}

// Fires once per message actually routed (not per poll tick -- see
// SlackInboundPoller.ts's own logging, which is silenced when nothing
// routes), so it stays proportionate to real activity. Without this, the
// only way to see what a persona was actually asked was to already know
// its runId and go read request.md -- there was no way to watch inbound
// traffic as it happened.
function logInbound(persona: string, runId: string, text: string) {
  console.log(`agent inbound: persona=${persona} runId=${runId} "${text}"`);
}

function content(botUserId: string, message: SlackMessage): string {
  const text = stripMention(botUserId, message.text);
  return `${message.user ?? "unknown"}: ${text}`;
}

function ctlPath(personaPath: AbsolutePath): AbsolutePath {
  return `${personaPath}/ctl` as AbsolutePath;
}

export async function postIfReplied(
  options: RouteOptions,
  reply: string | undefined,
) {
  if (reply !== undefined) {
    const payload = JSON.stringify({ message: reply, actionId: randomUUID() });
    await options.dispatchCtl(options.slackCtlPath, payload);
  }
}
