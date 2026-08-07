import type { ExecutionResult } from "../types/ExecutionResult";

export type PollClient = {
  execute(command: string): Promise<ExecutionResult>;
};

const POLL_INTERVAL_MS = 200;
const TERMINAL_STATES = ["complete", "failed", "cancelled", "interrupted"];

export async function pollTurn(client: PollClient, runPath: string) {
  let printed = "";
  while (true) {
    printed = await printGrowth(client, runPath, printed);
    const status = await readStatus(client, runPath);
    if (TERMINAL_STATES.includes(status.state)) {
      return status;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function printGrowth(client: PollClient, runPath: string, printed: string) {
  const content = (await client.execute(`cat ${runPath}/response.md`)).stdout;
  if (content.length > printed.length) {
    process.stdout.write(content.slice(printed.length));
  }
  return content;
}

async function readStatus(client: PollClient, runPath: string) {
  const result = await client.execute(`cat ${runPath}/status.json`);
  return JSON.parse(result.stdout) as { state: string; error?: string };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
