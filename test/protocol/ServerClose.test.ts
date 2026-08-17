import { expect, test } from "bun:test";
import { createServer } from "node:net";

import { closeServer } from "../../src/protocol/ServerClose";

test("closeServer propagates a server close error", async () => {
  await expect(closeServer(createServer())).rejects.toThrow("not running");
});
