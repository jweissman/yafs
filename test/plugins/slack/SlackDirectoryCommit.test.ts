import { expect, test } from "bun:test";

import { NodeStore } from "../../../src/vfs/NodeStore";
import { MountManager } from "../../../src/mounts/MountManager";
import { Wiring } from "../../../src/mounts/Plugin";
import { attemptDepsFor } from "../../../src/plugins/slack/SlackDirectoryCommit";

test("post rejects once the target mount no longer exists", async () => {
  const deps = testDeps();
  await expect(deps.post("missing", "hello")).rejects.toThrow(
    "No such mount: missing",
  );
});

test("commitRefresh is a no-op once the target mount no longer exists", async () => {
  let committed = false;
  const deps = testDeps(() => (committed = true));
  await deps.commitRefresh("missing");
  expect(committed).toBe(false);
});

function testDeps(onCommit?: () => void) {
  const wiring: Wiring = {
    mounts: new MountManager(new NodeStore()),
    journal: {
      commit: async () => onCommit?.(),
    } as unknown as Wiring["journal"],
    enqueue: async (work) => work(),
    registerCtl: () => undefined,
    unregisterCtl: () => undefined,
    dispatchCtl: async () => true,
  };
  return attemptDepsFor({
    wiring,
    clientFor: () => ({ postMessage: async () => "" }),
    outbox: { writeStatus: async () => undefined } as unknown as Parameters<
      typeof attemptDepsFor
    >[0]["outbox"],
  });
}
