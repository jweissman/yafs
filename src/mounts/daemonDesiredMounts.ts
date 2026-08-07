import { DesiredMounts } from "./DesiredMounts";
import { MountManager } from "./MountManager";

export function daemonDesiredMounts(
  mounts: MountManager,
  options: { configPath?: string },
) {
  return new DesiredMounts(mounts, { path: options.configPath });
}
