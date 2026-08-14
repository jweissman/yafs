import { expect, test } from "bun:test";

import {
  defaultClients,
  toolServerOptions,
} from "../../src/protocol/ServerClients";
import { AgentToolServer } from "../../src/plugins/agent/AgentToolServer";
import { SlackApiClient } from "../../src/plugins/slack/SlackApiClient";
import { MountManager } from "../../src/mounts/MountManager";
import { NodeStore } from "../../src/vfs/NodeStore";

test("defaultClients falls back to the real default clients when unoverridden", () => {
  const mounts = new MountManager(new NodeStore());
  const toolServer = new AgentToolServer(mounts, {});
  const clients = defaultClients({}, toolServer);
  expect(clients.slackClientFor({ channel: "C1" })).toBeInstanceOf(
    SlackApiClient,
  );
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
  };
  expect(toolServerOptions(services)).toEqual({
    store,
    mounts,
    traces: undefined,
    cache: undefined,
    desired: undefined,
  });
});
