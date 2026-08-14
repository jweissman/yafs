import { expect, test } from "bun:test";

import { waitFor } from "./slack_inbound_helpers";

test("waitFor times out when the condition never becomes true", async () => {
  await expect(waitFor(() => false, 30)).rejects.toThrow(
    "Timed out waiting for the condition",
  );
});
