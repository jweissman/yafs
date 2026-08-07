import { AbsolutePath } from "../core/AbsolutePath";
import { PreparedMountRecord } from "./types";

export function resourceReference(
  records: PreparedMountRecord[],
  path: AbsolutePath,
) {
  const record = mountFor(records, path);
  if (!record) {
    return undefined;
  }
  const relative = path.slice(record.path.length + 1);
  return record.snapshot.resourceReferences?.[relative];
}

function mountFor(records: PreparedMountRecord[], path: AbsolutePath) {
  return records.find((item) => path.startsWith(`${item.path}/`));
}
