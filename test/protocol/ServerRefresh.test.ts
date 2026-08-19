import { test } from "bun:test";

import { ServerRefresh } from "../../src/protocol/ServerRefresh";
import { Wiring } from "../../src/mounts/Plugin";
import { waitForLogEntry } from "../logging_helpers";

test("a timer tick that throws synchronously is caught and logged, not left unhandled", async () => {
  const wiring: Wiring = {
    mounts: {
      mounts: () => {
        throw new Error("boom");
      },
    } as unknown as Wiring["mounts"],
    journal: {} as never,
    enqueue: async (work) => work(),
    registerCtl: () => undefined,
    unregisterCtl: () => undefined,
    dispatchCtl: async () => true,
  };
  const refresh = new ServerRefresh(wiring, { intervalMs: 5 });

  refresh.start();
  try {
    await waitForLogEntry(
      (entry) => entry.message === "Refresh tick failed",
      2000,
    );
  } finally {
    refresh.close();
  }
});
