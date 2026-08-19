import { defaultSnapshotLimits } from "./mounts/SnapshotMaterializer";

export function snapshotLimits(env: NodeJS.ProcessEnv) {
  const { YAFS_SNAPSHOT_MAX_BYTES: bytes, YAFS_SNAPSHOT_MAX_FILES: files } =
    env;
  return bytes || files
    ? {
        bytes: bytes ? Number(bytes) : defaultSnapshotLimits.bytes,
        files: files ? Number(files) : defaultSnapshotLimits.files,
      }
    : undefined;
}
