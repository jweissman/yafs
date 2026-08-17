import { expect, test } from "bun:test";

import {
  defaultClients,
  toolServerOptions,
} from "../../src/protocol/ServerClients";
import { AgentToolServer } from "../../src/plugins/agent/AgentToolServer";
import { MountManager } from "../../src/mounts/MountManager";
import { NodeStore } from "../../src/vfs/NodeStore";
import type { Services } from "../../src/protocol/ServerTypes";

test("defaultClients exposes the real default factories when unoverridden", () => {
  const mounts = new MountManager(new NodeStore());
  const toolServer = new AgentToolServer(mounts, {});
  const clients = defaultClients({}, toolServer);
  expect(typeof clients.slackClientFor).toBe("function");
  expect(typeof clients.modelFor).toBe("function");
  expect(typeof clients.toolClientFor).toBe("function");
});

test("defaultClients wires toolServerUrl to the running tool server", () => {
  const mounts = new MountManager(new NodeStore());
  const toolServer = new AgentToolServer(mounts, {});
  toolServer.start(0);
  const clients = defaultClients({}, toolServer);
  const url = clients.toolServerUrl("agents", "reviewer");
  expect(url).toBe(toolServer.urlFor("agents", "reviewer"));
  toolServer.close();
});

test("toolServerOptions narrows Services down to what Yafs needs", () => {
  const mounts = new MountManager(new NodeStore());
  const store = new NodeStore();
  const services = {
    store,
    journal: undefined as never,
    mounts,
    traces: undefined as never,
    cache: undefined as never,
    desired: undefined as never,
  } as unknown as Services;
  expect(toolServerOptions(services) as unknown).toEqual({
    store,
    mounts,
    traces: undefined,
    cache: undefined,
    desired: undefined,
  });
});
