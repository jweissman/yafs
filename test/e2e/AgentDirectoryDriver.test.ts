import { expect, test } from "bun:test";

import { YashClient } from "../../src/protocol/client";
import { PersonaConfig } from "../../src/mounts/types";
import {
  fakeExchangeModel,
  fakeMessageModel,
  failingModel,
  waitForRun,
  waitForStatus,
  manifest,
  multiPersonaManifest,
} from "../agent_test_helpers";
import { startedHostConfigServer } from "../desired_mount_helpers";

test("a ctl message runs through pending -> complete status and durably records the exchange", async () => {
  const calls: Array<{ system: string; message: string }> = [];
  const modelFor = () => fakeExchangeModel("Looks fine to me.", calls);
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-",
    manifest({ reviewer: "You are a terse code reviewer." }),
    { modelFor },
  );
  await client.exec("plugins apply");
  await client.exec(
    'printf \'{"message":"Summarize this diff."}\' > agents/reviewer/ctl',
  );
  expect(await client.exec("ls agents/reviewer")).not.toContain("ctl");
  const runId = await waitForRun(client, "agents/reviewer/runs");
  await assertCompleteExchange(client, runId, calls);
  await client.close();
  await server.close();
});

async function assertCompleteExchange(
  client: YashClient,
  runId: string,
  calls: Array<{ system: string; message: string }>,
) {
  const status = JSON.parse(
    await client.exec(`cat agents/reviewer/runs/${runId}/status.json`),
  );
  expect(status.state).toBe("complete");
  expect(status.startedAt).toBeDefined();
  expect(status.completedAt).toBeDefined();
  expect(
    await client.exec(`cat agents/reviewer/runs/${runId}/request.md`),
  ).toBe("Summarize this diff.");
  expect(
    await client.exec(`cat agents/reviewer/runs/${runId}/response.md`),
  ).toBe("Looks fine to me.");
  expect(calls).toEqual([
    {
      system: "You are a terse code reviewer.",
      message: "Summarize this diff.",
    },
  ]);
}

test("a failed call leaves a visible failed status instead of vanishing silently", async () => {
  const modelFor = () => failingModel("connection refused");
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-fail-",
    manifest({ reviewer: "prompt" }),
    { modelFor },
  );
  await client.exec("plugins apply");
  await client.exec('printf \'{"message":"hi"}\' > agents/reviewer/ctl');
  const runId = await waitForStatus(
    client,
    "agents/reviewer/runs",
    (status) => status.state === "failed",
  );
  const status = JSON.parse(
    await client.exec(`cat agents/reviewer/runs/${runId}/status.json`),
  );
  expect(status.error).toBe("connection refused");
  expect(
    await client.exec(`cat agents/reviewer/runs/${runId}/request.md`),
  ).toBe("hi");
  await client.close();
  await server.close();
});

test("one mount can host multiple personas, each with its own endpoint", async () => {
  const calls: Record<string, string[]> = {
    "http://alpha.test": [],
    "http://beta.test": [],
  };
  const modelFor = (persona: PersonaConfig) =>
    fakeMessageModel(calls[persona.endpoint || ""]);
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-multi-",
    multiPersonaManifest(),
    { modelFor },
  );
  await client.exec("plugins apply");
  await client.exec('printf \'{"message":"hi"}\' > agents/alpha/ctl');
  await client.exec('printf \'{"message":"hi"}\' > agents/beta/ctl');
  await waitForRun(client, "agents/alpha/runs");
  await waitForRun(client, "agents/beta/runs");
  expect(calls["http://alpha.test"]).toEqual(["hi"]);
  expect(calls["http://beta.test"]).toEqual(["hi"]);
  await client.close();
  await server.close();
});

test("unmounting an agent removes its control endpoint immediately", async () => {
  const calls: string[] = [];
  const { server, client } = await startedHostConfigServer(
    "yafs-agents-unmount-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => fakeMessageModel(calls) },
  );
  await client.exec("plugins apply");
  await client.exec("plugin deactivate reviewer");
  await client.exec("mkdir agents");
  await client.exec("mkdir agents/reviewer");
  await client.exec("printf ordinary > agents/reviewer/ctl");
  expect(await client.exec("cat agents/reviewer/ctl")).toBe("ordinary");
  expect(calls).toEqual([]);
  await client.close();
  await server.close();
});
