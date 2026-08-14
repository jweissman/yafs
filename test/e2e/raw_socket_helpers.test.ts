import { createServer } from "node:net";
import { expect, test } from "bun:test";

import { address } from "./raw_socket_helpers";

test("address rejects a server that is not yet listening", () => {
  const server = createServer();
  expect(() => address(server)).toThrow("Server is not listening");
});
