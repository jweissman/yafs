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
