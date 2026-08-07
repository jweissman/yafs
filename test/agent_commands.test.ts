import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

import {
  fakeMessageModel,
  manifest,
  waitForStatus,
} from "./agent_test_helpers";
import { agentCommands } from "../src/commands/AgentCommands";
import { YafsServer } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";

test("agent command exposes one mutating command definition", () => {
  expect(agentCommands()).toMatchObject([{ name: "agent", access: "mutate" }]);
});

test("agent pseudobinaries send, inspect, and cancel a run without ctl JSON", async () => {
  const model = controlledModel();
  const { client, server } = await startedAgentServer(model);
  await expect(client.exec("agent nope")).rejects.toThrow("agent expects");
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  const accepted = await client.exec('agent send agents/reviewer "check this"');
  expect(accepted).toMatch(
    /^accepted: agents\/reviewer -> \/home\/root\/agents\/reviewer\/runs\/[\w-]+$/,
  );
  const run = accepted.split(" -> ")[1];
  const runId = run.split("/").pop()!;
  await waitForStatus(
    client,
    "agents/reviewer/runs",
    (status) => status.state === "running",
  );
  expect(JSON.parse(await client.exec(`agent status ${run}`)).state).toBe(
    "running",
  );
  expect(await client.exec(`agent cancel agents/reviewer ${runId}`)).toBe(
    `cancelling: agents/reviewer ${runId}`,
  );
  const status = JSON.parse(await client.exec(`agent status ${run}`));
  expect(status.state).toBe("cancelled");
  model.resolve("late response");
  await client.close();
  await server.close();
});

async function startedAgentServer(model: ReturnType<typeof controlledModel>) {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agent-command-")),
    modelFor: () => model.client,
  });
  const client = await YashClient.connect(server.address());
  return { client, server };
}

test("agent send resolves a bare persona name from anywhere, not just its own directory", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agent-cwd-")),
    modelFor: () => fakeMessageModel([]),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  await client.exec("mkdir elsewhere");
  await client.exec("cd elsewhere");
  const accepted = await client.exec('agent send reviewer "hi"');
  expect(accepted).toContain(
    "accepted: reviewer -> /home/root/agents/reviewer/runs/",
  );
  await expect(client.exec('agent send nope "hi"')).rejects.toThrow(
    "No such persona: nope",
  );
  await client.close();
  await server.close();
});

test("agent send rejects an ambiguous bare persona name shared by two plugins", async () => {
  const server = await YafsServer.start({
    dataDir: await mkdtemp(join(tmpdir(), "yafs-agent-ambiguous-")),
    modelFor: () => fakeMessageModel([]),
  });
  const client = await YashClient.connect(server.address());
  await client.exec(`printf '${manifest({ reviewer: "prompt" })}' > .yafsmeta`);
  await client.exec("mount activate .yafsmeta");
  const second = manifest({ reviewer: "prompt" })
    .replace("id: reviewer", "id: second")
    .replace("path: agents", "path: agents2");
  await client.exec(`printf '${second}' > .yafsmeta2`);
  await client.exec("mount activate .yafsmeta2 second");
  await expect(client.exec('agent send reviewer "hi"')).rejects.toThrow(
    "Ambiguous persona reviewer",
  );
  expect(await client.exec('agent send agents2/reviewer "hi"')).toContain(
    "accepted:",
  );
  await client.close();
  await server.close();
});

function controlledModel() {
  let resolve = (_value: string) => undefined;
  const client = {
    complete: () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  };
  return { client, resolve: (value: string) => resolve(value) };
}
