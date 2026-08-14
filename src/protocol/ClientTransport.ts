import { type Socket } from "node:net";
import { PROTOCOL_VERSION } from "./version";
import { LineBuffer } from "./LineBuffer";
import { Payload, Response } from "./ClientProtocol";
import { PendingRequests } from "./PendingRequests";
import { completionTarget } from "./CompletionTarget";

export function attachSocketEvents(
  socket: Socket,
  lines: LineBuffer,
  requests: PendingRequests,
) {
  socket.on("data", (chunk) => receive(String(chunk), lines, requests));
  socket.on("error", (error) => requests.failAll(error));
  socket.on("close", () => requests.failAll(new Error("Connection closed")));
}

function receive(chunk: string, lines: LineBuffer, requests: PendingRequests) {
  lines.push(chunk);
  lines
    .lines()
    .forEach((line) => requests.resolve(JSON.parse(line) as Response));
}

export function writeRequest(socket: Socket, id: number, payload: Payload) {
  const request = JSON.stringify({
    version: PROTOCOL_VERSION,
    id,
    ...payload,
  });
  socket.write(`${request}\n`);
}

export function connected(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
}

export function matches(
  stdout: string,
  completion: ReturnType<typeof completionTarget>,
) {
  return stdout
    .split("\n")
    .filter((name) => name.startsWith(completion.prefix))
    .map(completion.format);
}
