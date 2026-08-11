import { expect, test } from "bun:test";

import { YashClient } from "../../src/protocol/client";
import {
  chunkedModel,
  manifest,
  sleep,
  waitForRun,
} from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("a chunked reply is readable as growing content mid-run, then settles to the full reply", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-stream-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => chunkedModel(["first-", "second-", "third"], 150) },
  );
  await client.exec("plugins apply");
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  await assertPartialThenFull(client);
  await client.close();
  await server.close();
});

async function assertPartialThenFull(client: YashClient) {
  await sleep(200);
  const runId = await runDirName(client);
  const partial = await client.exec(
    `cat agents/reviewer/runs/${runId}/response.md`,
  );
  expect(partial).toBe("first-");
  await waitForRun(client, "agents/reviewer/runs");
  const full = await client.exec(
    `cat agents/reviewer/runs/${runId}/response.md`,
  );
  expect(full).toBe("first-second-third");
}

async function runDirName(client: YashClient) {
  const listing = await client.exec("ls agents/reviewer/runs");
  return listing.split("\n")[0];
}
