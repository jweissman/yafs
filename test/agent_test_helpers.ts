import { YashClient } from "../src/protocol/client";
import { parseJson } from "./json";

export * from "./agent_model_fakes";

type StatusMatcher = (status: { state: string }) => boolean;
interface PollState {
  client: YashClient;
  runsDir: string;
  matches: StatusMatcher;
  deadline: number;
}

export function waitForRun(
  client: YashClient,
  runsDir: string,
  timeoutMs = 3000,
): Promise<string> {
  return waitForStatus(client, runsDir, isComplete, timeoutMs);
}

function isComplete(status: { state: string }) {
  return status.state === "complete";
}

export async function waitForStatus(
  client: YashClient,
  runsDir: string,
  matches: StatusMatcher,
  timeoutMs = 3000,
): Promise<string> {
  return poll({ client, runsDir, matches, deadline: Date.now() + timeoutMs });
}

async function poll(state: PollState): Promise<string> {
  assertNotTimedOut(state);
  const runId = await pollRunId(state);
  if (runId) {
    return runId;
  }
  await sleep(20);
  return poll(state);
}

function assertNotTimedOut(state: PollState) {
  if (Date.now() >= state.deadline) {
    throw new Error(
      `Timed out waiting for a matching status under ${state.runsDir}`,
    );
  }
}

async function pollRunId(state: PollState): Promise<string | undefined> {
  const runId = await firstRunId(state);
  if (!runId) {
    return undefined;
  }
  const status = await readStatus(state.client, state.runsDir, runId);
  return status && state.matches(status) ? runId : undefined;
}

async function firstRunId(state: PollState) {
  const listing = await state.client
    .exec(`ls ${state.runsDir}`)
    .catch(() => "");
  return listing.split("\n")[0];
}

// A freshly listed run/action directory entry can momentarily precede its
// status.json becoming readable (a republish can be mid-flight) — treat a
// read failure as "not ready yet" so the poll retries instead of throwing.
async function readStatus(client: YashClient, runsDir: string, runId: string) {
  return client
    .exec(`cat ${runsDir}/${runId}/status.json`)
    .then(parseStatus)
    .catch(() => undefined);
}

function parseStatus(raw: string): { state: string } | undefined {
  const value = parseJson(raw);
  return validStatus(value) ? value : undefined;
}

function validStatus(value: unknown): value is { state: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    typeof value.state === "string"
  );
}

export function manifest(personas: Record<string, string>) {
  const entries = Object.entries(personas)
    .map(([name, prompt]) => `${name}: {prompt: "${prompt}"}`)
    .join(", ");
  return (
    `{version: 1, mounts: [{id: reviewer, path: agents, provider: agent, ` +
    `config: {personas: {${entries}}}, capabilities: [chat.completion]}]}`
  );
}

export function multiPersonaManifest() {
  const personas =
    'alpha: {prompt: "alpha prompt", endpoint: "http://alpha.test"}, ' +
    'beta: {prompt: "beta prompt", endpoint: "http://beta.test"}';
  return `{version: 1, mounts: [{id: agents, path: agents, provider: agent, config: {personas: {${personas}}}, capabilities: [chat.completion]}]}`;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
