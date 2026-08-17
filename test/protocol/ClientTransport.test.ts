import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { Socket } from "node:net";

import { LineBuffer } from "../../src/protocol/LineBuffer";
import { PendingRequests } from "../../src/protocol/PendingRequests";
import { attachSocketEvents } from "../../src/protocol/ClientTransport";

test("a socket error rejects every pending request synchronously", async () => {
  const socket = new EventEmitter() as unknown as Socket;
  const pending = requests(socket);
  attachSocketEvents(socket, new LineBuffer(), pending);
  const first = pending.send({ command: "pwd" });
  const second = pending.send({ command: "ls" });
  socket.emit("error", new Error("socket reset"));
  await expect(first).rejects.toThrow("socket reset");
  await expect(second).rejects.toThrow("socket reset");
});

function requests(_socket: Socket): PendingRequests {
  return new PendingRequests(
    () => false,
    () => undefined,
  );
}
