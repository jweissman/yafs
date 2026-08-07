import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { YashClient } from "../src/protocol/client";
import { YafsServer } from "../src/protocol/server";
import { PersonaConfig } from "../src/mounts/types";
import {
  fakeExchangeModel,
  fakeMessageModel,
  failingModel,
  waitForRun,
  waitForStatus,
  manifest,
  multiPersonaManifest,
} from "./agent_test_helpers";

test("a ctl message runs through pending -> complete status and durably records the exchange", async () => {
  const calls: Array<{ system: string; message: string }> = [];
  const modelFor = () => fakeExchangeModel("Looks fine to me.", calls);
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-")),
    modelFor,
  });
  const client = await YashClient.connect(server.address());
  await client.exec(
    `printf '${manifest({ reviewer: "You are a terse code reviewer." })}' > .yafsmeta`,
  );
  await client.exec("plugin activate .yafsmeta");
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
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-fail-")),
    modelFor,
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
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
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-multi-")),
    modelFor,
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${multiPersonaManifest()}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
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
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agents-unmount-")),
    modelFor: () => fakeMessageModel(calls),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("plugin activate .yafsmeta");
  await client.exec("plugin deactivate reviewer");
  await client.exec("mkdir agents");
  await client.exec("mkdir agents/reviewer");
  await client.exec("printf ordinary > agents/reviewer/ctl");
  expect(await client.exec("cat agents/reviewer/ctl")).toBe("ordinary");
  expect(calls).toEqual([]);
  await client.close();
  await server.close();
});
