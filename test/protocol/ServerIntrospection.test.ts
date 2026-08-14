import { expect, test } from "bun:test";
import { createServer } from "node:net";

import { serverAddress } from "../../src/protocol/ServerIntrospection";

test("serverAddress rejects a server that is not listening", () => {
  const server = createServer();
  expect(() => serverAddress(server)).toThrow("Not listening");
});
