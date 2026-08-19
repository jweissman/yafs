import Yafs from "../index";
import { DesiredMounts } from "../mounts/DesiredMounts";
import { VfsOperation } from "../vfs/VfsOperation";
import { log } from "../Logging";

const reconcileLog = log.getSubLogger({ name: "server.reconcile" });

export async function reconcileDesired(
  desired: DesiredMounts,
  session: () => Yafs,
  commit: (current: Yafs, operations: VfsOperation[]) => Promise<void>,
) {
  if (!(await desired.status()).configured) {
    return;
  }
  await applyDesired(session(), commit).catch(logged);
}

function logged(error: unknown) {
  reconcileLog.error({ error: detail(error) }, "startup reconcile failed");
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function applyDesired(
  current: Yafs,
  commit: (current: Yafs, operations: VfsOperation[]) => Promise<void>,
) {
  const plan = await current.planAsync("plugins apply");
  if (plan.result.error) {
    throw new Error(plan.result.error.message);
  }
  await commit(current, plan.operations);
}
