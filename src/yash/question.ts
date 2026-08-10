import { createInterface } from "node:readline/promises";

export function question(
  readline: ReturnType<typeof createInterface>,
  prompt: string,
  interruption: AbortController,
) {
  return readline
    .question(prompt, { signal: interruption.signal })
    .catch((error: unknown) => abortedOrThrow(interruption, error));
}

function abortedOrThrow(interruption: AbortController, error: unknown) {
  if (interruption.signal.aborted) {
    return undefined;
  }
  throw error;
}
