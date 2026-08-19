import { readFile } from "node:fs/promises";

export async function loggedEntries(
  run: () => Promise<unknown>,
): Promise<Record<string, unknown>[]> {
  await run().catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return entries();
}

export async function waitForLogEntry(
  matches: (entry: Record<string, unknown>) => boolean,
  timeoutMs = 2000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await entries()).find(matches);
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for a matching log entry");
}

async function entries(): Promise<Record<string, unknown>[]> {
  const content = await readFile(".yafs-test/test.jsonl", "utf8").catch(
    () => "",
  );
  return content
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
