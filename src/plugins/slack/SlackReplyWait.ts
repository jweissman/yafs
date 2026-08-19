import { MountManager } from "../../mounts/MountManager";
import { log } from "../../Logging";
import { PersonaTarget } from "../agent/AgentPersonaLookup";

const replyLog = log.getSubLogger({ name: "slack.reply" });

export interface RunLookup {
  mounts: MountManager;
  target: PersonaTarget;
  runId: string;
}

const POLL_INTERVAL_MS = 300;
const TERMINAL_STATES = ["complete", "failed", "cancelled", "interrupted"];

export async function awaitReply(
  lookup: RunLookup,
  timeoutMs: number,
): Promise<string | undefined> {
  const settled = await pollUntil(lookup, Date.now() + timeoutMs);
  return replyFor(settled, lookup, timeoutMs);
}

function replyFor(
  settled: { terminal: true; value: string } | undefined,
  lookup: RunLookup,
  timeoutMs: number,
): string | undefined {
  if (!settled) {
    logAbandoned(lookup, timeoutMs);
  }
  return settled ? replyValue(settled.value) : undefined;
}

function replyValue(value: string): string | undefined {
  return value === "" ? undefined : value;
}

async function pollUntil(lookup: RunLookup, deadline: number) {
  while (Date.now() < deadline) {
    const tick = await pollTick(lookup);
    if (tick.terminal) {
      return tick;
    }
  }
  return undefined;
}

async function pollTick(lookup: RunLookup) {
  const settled = settledReply(lookup);
  if (settled === undefined) {
    await sleep(POLL_INTERVAL_MS);
    return { terminal: false as const };
  }
  return { terminal: true as const, value: settled };
}

function settledReply(lookup: RunLookup): string | undefined {
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
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

function logAbandoned(lookup: RunLookup, timeoutMs: number) {
  const { personaName } = lookup.target;
  const path = `${personaName}/runs/${lookup.runId}/response.md`;
  const fields = { personaName, runId: lookup.runId, timeoutMs, path };
  replyLog.error(fields, ABANDONED_MESSAGE);
}

const ABANDONED_MESSAGE =
  "Slack reply abandoned: run did not reach a terminal state in time; " +
  "if it finishes later it will not auto-post — check the response " +
  "path and post it yourself with `slack send` if it's there";
