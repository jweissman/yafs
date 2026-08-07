import Yafs from "../index";
import { DesiredMounts } from "../mounts/DesiredMounts";
import { VfsOperation } from "../vfs/VfsOperation";

export async function reconcileDesired(
  desired: DesiredMounts,
  session: () => Yafs,
  commit: (current: Yafs, operations: VfsOperation[]) => Promise<void>,
) {
  if (!(await desired.status()).configured) {
    return;
  }
  return applyDesired(session(), commit);
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
