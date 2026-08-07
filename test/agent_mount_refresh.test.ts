import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";
import {
  fakeExchangeModel,
  waitForRun,
  manifest,
  sleep,
} from "./agent_test_helpers";

test("an operator plugin refresh keeps run history durable and still picks up a changed prompt", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-refresh-")),
    modelFor: () => fakeExchangeModel("ok", []),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(
    `printf '${manifest({ reviewer: "v1 prompt" })}' > .yafsmeta`,
  );
  await client.exec("plugin activate .yafsmeta");
  await sleep(400);
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForRun(client, "agents/reviewer/runs");
  await client.exec(
    `printf '${manifest({ reviewer: "v2 prompt" })}' > .yafsmeta`,
  );
  await client.exec("plugin refresh .yafsmeta reviewer");
  expect(await client.exec("cat agents/reviewer/prompt.md")).toBe("v2 prompt");
  expect(
    await client.exec(`cat agents/reviewer/runs/${runId}/status.json`),
  ).toContain("complete");
  await client.close();
  await server.close();
});

test("a ctl-triggered run leaves an audit entry naming the persona and run, not just the mount", async () => {
  const directory = await mkdtemp(join(tmpdir(), "yafs-agents-audit-"));
  const server = await YafsServer.start({
    dataDir: directory,
    modelFor: () => fakeExchangeModel("ok", []),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
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
      .map((line) => JSON.parse(line)),
  );
}
