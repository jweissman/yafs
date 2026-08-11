import { createConnection, createServer } from "node:net";

export function waitForClose(
  socket: ReturnType<typeof createConnection>,
  payload: string,
) {
  return new Promise<void>((resolve, reject) => {
    socket.once("connect", () => socket.write(payload));
    socket.once("close", resolve);
    socket.once("error", reject);
  });
}

export function protocolFailure() {
  return '{"version":2,"id":1,"error":{"code":"unsupported","message":"unsupported"}}\n';
}

export function listen(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

export function address(server: ReturnType<typeof createServer>) {
  const value = server.address();
  if (!value || typeof value === "string") {
    throw new Error("Server is not listening");
  }
  return { host: value.address, port: value.port };
}

export function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}
