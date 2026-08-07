import { createInterface } from "node:readline/promises";

export async function question(
  readline: ReturnType<typeof createInterface>,
  prompt: string,
  interruption: AbortController,
) {
  try {
    return await readline.question(prompt, { signal: interruption.signal });
  } catch (error) {
    return abortedOrThrow(interruption, error);
  }
}

function abortedOrThrow(interruption: AbortController, error: unknown) {
  if (interruption.signal.aborted) {
    return undefined;
  }
  throw error;
}
