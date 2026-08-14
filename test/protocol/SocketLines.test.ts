import { EventEmitter } from "node:events";
import { expect, test } from "bun:test";

import { attachLines } from "../../src/protocol/SocketLines";

test("attachLines destroys the socket instead of buffering an unbounded line", () => {
  const socket = new EventEmitter() as EventEmitter & { destroy(): void };
  let destroyed = false;
  socket.destroy = () => {
    destroyed = true;
  };
  const lines: string[] = [];
  attachLines(socket as never, (line) => lines.push(line));
  socket.emit("data", "a".repeat(1_048_577));
  expect(destroyed).toBe(true);
  expect(lines).toEqual([]);
});
