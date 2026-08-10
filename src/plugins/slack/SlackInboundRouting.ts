import { randomUUID } from "node:crypto";

import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import {
  PersonaTarget,
  resolvePersonaTarget,
} from "../agent/AgentPersonaLookup";
import { SlackMessage } from "./SlackApiClient";

export type DispatchCtl = (
  path: AbsolutePath,
  payload: string,
) => Promise<boolean>;

// Both legs of this route are ordinary ctl writes — the same primitive
// `agent send`/`slack send` reduce to once their command-line parsing is
// done. Routing the reply through the Slack mount's own ctl path (instead
// of calling the Slack client directly) reuses SlackDirectoryDriver's
// existing outbound handling rather than opening a second call site.
export type RouteOptions = {
  mounts: MountManager;
  dispatchCtl: DispatchCtl;
  persona: string;
  slackCtlPath: AbsolutePath;
};

type RunLookup = { mounts: MountManager; target: PersonaTarget; runId: string };

const POLL_INTERVAL_MS = 300;
const TIMEOUT_MS = 30_000;
const TERMINAL_STATES = ["complete", "failed", "cancelled", "interrupted"];

export async function routeMessage(
  options: RouteOptions,
  chatId: string,
  message: SlackMessage,
) {
  const target = resolvePersonaTarget(options.mounts, options.persona);
  const runId = randomUUID();
  await dispatch(options, target.personaPath, chatId, message, runId);
  await reply({ mounts: options.mounts, target, runId }, options);
}

async function reply(lookup: RunLookup, options: RouteOptions) {
  const text = await awaitReply(lookup);
  await postIfReplied(options, text);
}

function dispatch(
  options: RouteOptions,
  personaPath: AbsolutePath,
  chatId: string,
  message: SlackMessage,
  runId: string,
) {
  const body = { message: content(message), chatId, runId };
  return options.dispatchCtl(ctlPath(personaPath), JSON.stringify(body));
}

function content(message: SlackMessage): string {
  return `${message.user ?? "unknown"}: ${message.text}`;
}

function ctlPath(personaPath: AbsolutePath): AbsolutePath {
  return `${personaPath}/ctl` as AbsolutePath;
}

async function postIfReplied(options: RouteOptions, reply: string | undefined) {
  if (reply !== undefined) {
    const payload = JSON.stringify({ message: reply });
    await options.dispatchCtl(options.slackCtlPath, payload);
  }
}

async function awaitReply(lookup: RunLookup): Promise<string | undefined> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const tick = await pollTick(lookup);
    if (tick.terminal) {
      return tick.value || undefined;
    }
  }
  return undefined;
}

async function pollTick(lookup: RunLookup) {
  const settled = await settledReply(lookup);
  if (settled === undefined) {
    await sleep(POLL_INTERVAL_MS);
    return { terminal: false as const };
  }
  return { terminal: true as const, value: settled };
}

async function settledReply(lookup: RunLookup): Promise<string | undefined> {
  const status = readStatus(lookup);
  if (!status || !TERMINAL_STATES.includes(status.state)) {
    return undefined;
  }
  return status.state === "complete" ? readResponse(lookup) : "";
}

function readStatus(lookup: RunLookup) {
  const { target, runId } = lookup;
  const path = `${target.personaName}/runs/${runId}/status.json`;
  const raw = entry(lookup, path);
  return raw ? (JSON.parse(raw) as { state: string }) : undefined;
}

function readResponse(lookup: RunLookup) {
  const { target, runId } = lookup;
  return entry(lookup, `${target.personaName}/runs/${runId}/response.md`);
}

function entry(lookup: RunLookup, path: string) {
  const { mounts, target } = lookup;
  const record = mounts.mounts().find((item) => item.id === target.mountId);
  const found = record?.snapshot.entries.find(([p]) => p === path);
  return found?.[1];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
