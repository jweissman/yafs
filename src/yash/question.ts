import { createInterface } from "node:readline/promises";

export function question(
  readline: ReturnType<typeof createInterface>,
  prompt: string,
  interruption: AbortController,
): Promise<string | undefined> {
  return readline
    .question(prompt, { signal: interruption.signal })
    .catch(questionError(interruption));
}

function questionError(interruption: AbortController) {
  return (error: unknown): undefined => {
    abortedOrThrow(interruption, error);
    return undefined;
  };
}

function abortedOrThrow(
  interruption: AbortController,
  error: unknown,
): undefined {
  if (interruption.signal.aborted) {
    return undefined;
  }
  throw error;
}
