import { expect, test } from "bun:test";

import {
  fakeMessageModel,
  manifest,
  multiPersonaManifest,
  waitForStatus,
} from "./agent_test_helpers";
import { agentCommands } from "../src/plugins/agent/AgentCommands";
import { parseManifest } from "../src/mounts/Manifest";
import { startedHostConfigServer } from "./desired_mount_helpers";

test("agent command exposes one mutating command definition", () => {
  expect(agentCommands()).toMatchObject([{ name: "agent", access: "mutate" }]);
});

test("agent pseudobinaries send, inspect, and cancel a run without ctl JSON", async () => {
  const model = controlledModel();
  const { client, server } = await startedAgentServer(model);
  await expect(client.exec("agent nope")).rejects.toThrow("agent expects");
  await client.exec("plugins apply");
  const accepted = await client.exec('agent send agents/reviewer "check this"');
  expect(accepted).toMatch(
    // eslint-disable-next-line @stylistic/max-len -- unsplittable regex literal
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
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-command-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => model.client },
  );
  return { client, server };
}

test("agent send resolves a bare persona name from anywhere, not just its own directory", async () => {
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-cwd-",
    manifest({ reviewer: "prompt" }),
    { modelFor: () => fakeMessageModel([]) },
  );
  await client.exec("plugins apply");
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
  const second = manifest({ reviewer: "prompt" })
    .replace("id: reviewer", "id: second")
    .replace("path: agents", "path: agents2");
  const combined = combinedManifests(manifest({ reviewer: "prompt" }), second);
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-ambiguous-",
    combined,
    { modelFor: () => fakeMessageModel([]) },
  );
  await client.exec("plugins apply");
  await expect(client.exec('agent send reviewer "hi"')).rejects.toThrow(
    "Ambiguous persona reviewer",
  );
  expect(await client.exec('agent send agents2/reviewer "hi"')).toContain(
    "accepted:",
  );
  await client.close();
  await server.close();
});

function combinedManifests(first: string, second: string) {
  const mounts = [
    ...parseManifest(first).manifest.mounts,
    ...parseManifest(second).manifest.mounts,
  ];
  return JSON.stringify({ version: 1, mounts });
}

test("agent personas lists every configured persona across active agent mounts", async () => {
  const bareServer = await startedHostConfigServer(
    "yafs-agent-personas-empty-",
    "{version: 1, mounts: []}",
  );
  expect(JSON.parse(await bareServer.client.exec("agent personas"))).toEqual(
    [],
  );
  await bareServer.client.close();
  await bareServer.server.close();
  const { server, client } = await startedHostConfigServer(
    "yafs-agent-personas-",
    multiPersonaManifest(),
  );
  await client.exec("plugins apply");
  expect(JSON.parse(await client.exec("agent personas"))).toEqual([
    { mountPath: "/home/root/agents", persona: "alpha" },
    { mountPath: "/home/root/agents", persona: "beta" },
  ]);
  await client.close();
  await server.close();
});

function controlledModel() {
  let resolve = (_value: string) => undefined;
  const client = {
    completeChat: () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  };
  return { client, resolve: (value: string) => resolve(value) };
}
