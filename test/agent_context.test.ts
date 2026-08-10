import { expect, test } from "bun:test";

import { fakeExchangeModel, manifest, waitForRun } from "./agent_test_helpers";
import { startedHostConfigServer } from "./desired_mount_helpers";

test("agent send records and supplies an explicit virtual-file context", async () => {
  const calls: Array<{ system: string; message: string }> = [];
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-context-",
    manifest({ reviewer: "review carefully" }),
    { modelFor: () => fakeExchangeModel("review", calls) },
  );
  await client.exec("plugins apply");
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
