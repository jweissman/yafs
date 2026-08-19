import { createInterface } from "node:readline/promises";

type Readline = ReturnType<typeof createInterface>;

export function question(
  readline: Readline,
  prompt: string,
  interruption: AbortController,
) {
  return Promise.resolve()
    .then(() => readline.question(prompt, { signal: interruption.signal }))
    .catch(catchWith(interruption));
}

function catchWith(interruption: AbortController) {
  // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
  return (error: unknown) => recovered(interruption, error);
}

function recovered(interruption: AbortController, error: unknown): undefined {
  if (interruption.signal.aborted) {
    return undefined;
  }
  console.error(
    `yash: terminal input failed unexpectedly (${detail(error)}); exiting.`,
  );
  return undefined;
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
