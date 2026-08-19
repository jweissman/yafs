import { expect, test } from "bun:test";

import Yafs from "../../../src/index";
import { Wiring } from "../../../src/mounts/Plugin";
import { SchedulerDriver } from "../../../src/plugins/scheduler/SchedulerDriver";
import { activateDesired } from "../../desired_mount_helpers";

function fakeWiring(yafs: Yafs, onEnqueue: () => void): Wiring {
  return {
    mounts: yafs.mounts,
    journal: { commit: async () => undefined } as unknown as Wiring["journal"],
    enqueue: async (work) => {
      onEnqueue();
      await work();
    },
    registerCtl: () => undefined,
    unregisterCtl: () => undefined,
    dispatchCtl: async () => true,
  };
}

test("each tick is routed through the driver's enqueue, not fired directly", async () => {
  const yafs = new Yafs();
  await activateDesired(yafs, schedulerManifest(15));
  yafs.store.write("/home/root/slow.yash", "touch ticked.txt");
  let enqueued = 0;
  const driver = new SchedulerDriver(
    fakeWiring(yafs, () => (enqueued += 1)),
    yafs,
  );

  driver.sync();
  await waitFor(() => enqueued > 0);
  driver.close();

  expect(enqueued).toBeGreaterThan(0);
  expect(yafs.exec("test -e ticked.txt")).toBe("true");
});

async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("condition never became true");
}

function schedulerManifest(intervalMs: number) {
  return (
    "{version: 1, mounts: [{id: sched, path: sched, provider: scheduler, " +
    `config: {script: /home/root/slow.yash, intervalMs: ${intervalMs}, ` +
    "allow: [mutate]}, capabilities: [control.scheduled-execution]}]}"
  );
}
