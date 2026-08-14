import { MountManager } from "../../mounts/MountManager";
import { PersonaTarget } from "../agent/AgentPersonaLookup";

export type RunLookup = {
  mounts: MountManager;
  target: PersonaTarget;
  runId: string;
};

const POLL_INTERVAL_MS = 300;
const TERMINAL_STATES = ["complete", "failed", "cancelled", "interrupted"];

export async function awaitReply(
  lookup: RunLookup,
  timeoutMs: number,
): Promise<string | undefined> {
  const settled = await pollUntil(lookup, Date.now() + timeoutMs);
  return settled ? settled.value || undefined : abandoned(lookup, timeoutMs);
}

function abandoned(lookup: RunLookup, timeoutMs: number): undefined {
  logAbandoned(lookup, timeoutMs);
  return undefined;
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

// unref: a pending reply-wait is a detached background watcher (see
// SlackInboundRouting's `void reply(...)`), not something daemon shutdown
// should wait on. Without this, a ref'd timer keeps the process alive for
// up to the reply timeout, so `yafsd stop` clears its state file (and
// reports success) while the OS process is still running underneath it.
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

function logAbandoned(lookup: RunLookup, timeoutMs: number) {
  const { personaName } = lookup.target;
  const path = `${personaName}/runs/${lookup.runId}/response.md`;
  console.error(
    `Slack reply abandoned: ${personaName} run ${lookup.runId} did not ` +
      `reach a terminal state within ${timeoutMs}ms. If it finishes later, ` +
      `it will not auto-post — check \`cat ${path}\` and post it yourself ` +
      "with `slack send` if it's there.",
  );
}
