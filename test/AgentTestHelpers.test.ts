import { expect, test } from "bun:test";

import { YashClient } from "../src/protocol/client";
import { waitForStatus } from "./agent_test_helpers";

test("waitForStatus keeps polling while no run directory exists yet, then times out", async () => {
  const client = { exec: async () => "" } as unknown as YashClient;
  await expect(
    waitForStatus(client, "agents/reviewer/runs", () => true, 30),
  ).rejects.toThrow("Timed out waiting for a matching status");
});

test("waitForStatus treats a failed listing the same as an empty one, not a crash", async () => {
  const client = {
    exec: async () => {
      throw new Error("no such directory");
    },
  } as unknown as YashClient;
  await expect(
    waitForStatus(client, "agents/reviewer/runs", () => true, 30),
  ).rejects.toThrow("Timed out waiting for a matching status");
});

test("waitForStatus retries a status read that fails after the listing already found it", async () => {
  let reads = 0;
  const client = {
    exec: async (command: string) => {
      if (command.startsWith("ls")) {
        return "run-1";
      }
      reads += 1;
      if (reads === 1) {
        throw new Error("No such file: status.json");
      }
      return JSON.stringify({ state: "complete" });
    },
  } as unknown as YashClient;
  const runId = await waitForStatus(
    client,
    "agents/reviewer/runs",
    (status) => status.state === "complete",
  );
  expect(runId).toBe("run-1");
});
