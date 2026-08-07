import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

import { fakeExchangeModel, manifest, waitForRun } from "./agent_test_helpers";
import { YafsServer } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";

test("agent send records and supplies an explicit virtual-file context", async () => {
  const calls: Array<{ system: string; message: string }> = [];
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agent-context-")),
    modelFor: () => fakeExchangeModel("review", calls),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(
    `printf '${manifest({ reviewer: "review carefully" })}' > .yafsmeta`,
  );
  await client.exec("mount activate .yafsmeta");
  await client.exec("printf diff-body > diff.patch");
  await client.exec(
    'agent send agents/reviewer --context diff.patch "Review this"',
  );
  const runId = await waitForRun(client, "agents/reviewer/runs");
  expect(
    await client.exec(`cat agents/reviewer/runs/${runId}/context.md`),
  ).toBe("diff-body");
  expect(calls).toEqual([
    {
      system: "review carefully",
      message: "Review this\n\nContext:\ndiff-body",
    },
  ]);
  await client.close();
  await server.close();
});
