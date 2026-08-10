import { type Socket } from "node:net";

export function attachLines(socket: Socket, onLine: (line: string) => void) {
  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk;
    buffer = consumeLines(socket, buffer, onLine);
  });
}

function consumeLines(
  socket: Socket,
  buffer: string,
  onLine: (line: string) => void,
) {
  return oversized(socket, buffer) ? buffer : dispatchLines(buffer, onLine);
}

function oversized(socket: Socket, buffer: string) {
  const over = buffer.length > 1_048_576;
  if (over) {
    socket.destroy();
  }
  return over;
}

function dispatchLines(buffer: string, onLine: (line: string) => void) {
  const lines = buffer.split("\n");
  const rest = lines.pop() || "";
  lines.filter(Boolean).forEach(onLine);
  return rest;
}
