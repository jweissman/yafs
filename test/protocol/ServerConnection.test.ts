import { EventEmitter } from "node:events";
import { expect, test } from "bun:test";

import { ServerConnection } from "../../src/protocol/ServerConnection";
import { NodeStore } from "../../src/vfs/NodeStore";

test("an unrecoverable command error destroys the socket instead of hanging it", () => {
  const connection = new ServerConnection(fakeServices(), () => ({}) as never);
  const socket = fakeSocket();
  connection.abort(new Error("boom"), socket as never);
  expect(socket.destroyed).toBe(true);
});

test("a failure while responding to a request failure aborts the connection", async () => {
  const connection = new ServerConnection(fakeServices(), () => ({}) as never);
  const socket = fakeSocket();
  socket.write = () => {
    throw new Error("socket gone");
  };
  connection.attach(socket as never);
  socket.emit("data", '{"version":1,"id":1,"command":"pwd"}\n');
  await Bun.sleep(0);
  expect(socket.destroyed).toBe(true);
});

test("a socket-level error tears the connection down", () => {
  const connection = new ServerConnection(fakeServices(), () => ({}) as never);
  const socket = fakeSocket();
  connection.attach(socket as never);
  socket.emit("error", new Error("reset"));
  expect(socket.destroyed).toBe(true);
});

function fakeServices() {
  const store = new NodeStore();
  return {
    store,
    journal: {} as never,
    mounts: {} as never,
    traces: {} as never,
    cache: {} as never,
    desired: {} as never,
  };
}

function fakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    destroyed: boolean;
    destroy(): void;
    setEncoding(): void;
    write?(value: string): void;
  };
  socket.destroyed = false;
  socket.destroy = () => {
    socket.destroyed = true;
  };
  socket.setEncoding = () => undefined;
  return socket;
}
