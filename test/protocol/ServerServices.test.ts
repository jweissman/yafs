import { expect, test } from "bun:test";

import { openServices } from "../../src/protocol/ServerServices";

test("openServices requires either walPath or dataDir", async () => {
  await expect(openServices({})).rejects.toThrow(
    "walPath or dataDir is required",
  );
});
