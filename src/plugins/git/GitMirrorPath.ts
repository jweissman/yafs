import { tmpdir } from "node:os";
import { join } from "node:path";

export function mirrorPathFor(mountId: string): string {
  return join(tmpdir(), "yafs-git-mirrors", mountId);
}
