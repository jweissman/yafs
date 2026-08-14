import { expect, test } from "bun:test";

import Yafs from "../../../src";
import { activateDesired } from "../../desired_mount_helpers";
import { manifest, toolServer } from "./agent_tool_server_helpers";

test("a request for an unknown mount or persona 404s before any session starts", async () => {
  const yafs = new Yafs();
  const server = toolServer(yafs);
  server.start(0);
  const url = server.urlFor("agents", "nope");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(initializeRequest()),
  });
  expect(response.status).toBe(404);
  server.close();
});

test("a non-initialize request with no session id is a bad request", async () => {
  const yafs = new Yafs();
  await activateDesired(yafs, manifest(["/home/root/work"]), "agents");
  const server = toolServer(yafs);
  server.start(0);
  const url = server.urlFor("agents", "reviewer");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(response.status).toBe(400);
  server.close();
});

test("a GET with no matching session is a bad request", async () => {
  const yafs = new Yafs();
  const server = toolServer(yafs);
  server.start(0);
  const response = await fetch(server.urlFor("agents", "reviewer"));
  expect(response.status).toBe(400);
  server.close();
});

function initializeRequest() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  };
}
