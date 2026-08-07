import { AbsolutePath } from "../core/AbsolutePath";
import { MountManager } from "./MountManager";

export function slackPluginPath(
  mounts: MountManager,
  id: string,
): AbsolutePath {
  const record = mounts
    .mounts()
    .find((item) => item.id === id && item.provider === "slack");
  if (!record) {
    throw new Error(`No such slack plugin: ${id}`);
  }
  return record.path;
}
