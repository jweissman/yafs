import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";

export function slackPluginPath(
  mounts: MountManager,
  id: string,
): AbsolutePath {
  const record = mounts
    .mounts()
    .find((item) => item.id === id && item.provider === "slack");
  return required(record, id).path;
}

function required(record: { path: AbsolutePath } | undefined, id: string) {
  if (!record) {
    throw new Error(`No such slack plugin: ${id}`);
  }
  return record;
}
