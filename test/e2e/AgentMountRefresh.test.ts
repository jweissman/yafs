import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  fakeExchangeModel,
  waitForRun,
  manifest,
  sleep,
} from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";
import { parseJson } from "../json";

test("an operator plugin refresh keeps run history durable and still picks up a changed prompt", async () => {
  const { configPath, server, client } = await startedHostConfigServer(
    "yafs-agents-refresh-",
    manifest({ reviewer: "v1 prompt" }),
    { modelFor: () => fakeExchangeModel("ok", []) },
  );
  await client.exec("plugins apply");
  await sleep(400);
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForRun(client, "agents/reviewer/runs");
  await writeFile(configPath, manifest({ reviewer: "v2 prompt" }));
  await client.exec("plugins refresh reviewer");
  expect(await client.exec("cat agents/reviewer/prompt.md")).toBe("v2 prompt");
  expect(
    await client.exec(`cat agents/reviewer/runs/${runId}/status.json`),
  ).toContain("complete");
  await client.close();
  await server.close();
});

test("a ctl-triggered run leaves an audit entry naming the persona and run, not just the mount", async () => {
  const { directory, server, client } = await startedHostConfigServer(
    "yafs-agents-audit-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => fakeExchangeModel("ok", []) },
  );
  await client.exec("plugins apply");
  await sleep(400);
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForRun(client, "agents/reviewer/runs");
  const detail = await lastDetail(directory, runId);
  expect(detail).toBe(`persona=reviewer run=${runId} state=complete`);
  await client.close();
  await server.close();
});

async function lastDetail(
  directory: string,
  runId: string,
): Promise<string | undefined> {
  const events = await audit(directory);
  return events.filter((event) => event.detail?.includes(runId)).at(-1)?.detail;
}

function audit(directory: string) {
  return readFile(join(directory, "audit.ndjson"), "utf8").then((source) =>
    source
      .trim()
      .split("\n")
      .map(auditEvent),
  );
}

function auditEvent(line: string): { detail?: string } {
  const value = parseJson(line);
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const { detail } = value as Record<string, unknown>;
  return typeof detail === "string" ? { detail } : {};
}
