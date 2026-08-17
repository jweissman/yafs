import type { ExecutionResult } from "../types/ExecutionResult";

export interface PollClient {
  execute(command: string): Promise<ExecutionResult>;
}

const POLL_INTERVAL_MS = 200;
const TERMINAL_STATES = ["complete", "failed", "cancelled", "interrupted"];
interface RunStatus {
  state: string;
  error?: string;
}

export async function pollTurn(client: PollClient, runPath: string) {
  let printed = "";
  for (;;) {
    printed = await printGrowth(client, runPath, printed);
    const status = await tick(client, runPath);
    if (status) {
      return status;
    }
  }
}

async function tick(
  client: PollClient,
  runPath: string,
): Promise<RunStatus | undefined> {
  const status = await readStatus(client, runPath);
  return TERMINAL_STATES.includes(status.state) ? status : pause();
}

async function pause(): Promise<undefined> {
  await sleep(POLL_INTERVAL_MS);
  return undefined;
}

async function printGrowth(
  client: PollClient,
  runPath: string,
  printed: string,
) {
  const content = (await client.execute(`cat ${runPath}/response.md`)).stdout;
  printGrowthDelta(content, printed);
  return content;
}

function printGrowthDelta(content: string, printed: string) {
  if (content.length > printed.length) {
    process.stdout.write(content.slice(printed.length));
  }
}

async function readStatus(
  client: PollClient,
  runPath: string,
): Promise<RunStatus> {
  const result = await client.execute(`cat ${runPath}/status.json`);
  return JSON.parse(result.stdout) as RunStatus;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
