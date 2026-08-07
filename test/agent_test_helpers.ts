import { YashClient } from "../src/protocol/client";
import { ModelClient } from "../src/plugins/agent/ChatCompletionClient";

type StatusMatcher = (status: { state: string }) => boolean;
type PollState = {
  client: YashClient;
  runsDir: string;
  matches: StatusMatcher;
  deadline: number;
};

export function fakeExchangeModel(
  reply: string,
  calls: Array<{ system: string; message: string }>,
): ModelClient {
  return {
    complete: async (system, message) => {
      calls.push({ system, message });
      return reply;
    },
  };
}

export function fakeMessageModel(messages: string[]): ModelClient {
  return {
    complete: async (_system, message) => {
      messages.push(message);
      return `reply-to-${message}`;
    },
  };
}

export function failingModel(message: string): ModelClient {
  return {
    complete: async () => {
      throw new Error(message);
    },
  };
}

export function slowModel(reply: string, delayMs: number): ModelClient {
  return {
    complete: async () => {
      await sleep(delayMs);
      return reply;
    },
  };
}

export async function waitForRun(
  client: YashClient,
  runsDir: string,
  timeoutMs = 3000,
): Promise<string> {
  return waitForStatus(
    client,
    runsDir,
    (status) => status.state === "complete",
    timeoutMs,
  );
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
  const listing = await state.client
    .exec(`ls ${state.runsDir}`)
    .catch(() => "");
  const runId = listing?.split("\n")[0];
  if (!runId) {
    return undefined;
  }
  const status = await readStatus(state.client, state.runsDir, runId);
  return state.matches(status) ? runId : undefined;
}

async function readStatus(client: YashClient, runsDir: string, runId: string) {
  return JSON.parse(await client.exec(`cat ${runsDir}/${runId}/status.json`));
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
