import { AbsolutePath } from "../core/AbsolutePath";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { assertDesiredAvailable } from "./MountRestore";
import { prepareRecord, PrepareServices } from "./MountPreparation";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";

export interface PrepareDeps {
  planner: MountPlanner;
  persistence: MountPersistence;
  prepareServices: PrepareServices;
  records: () => PreparedMountRecord[];
}

export function planDesiredMount(
  deps: PrepareDeps,
  mount: ManifestMount,
  digest: string,
  root: AbsolutePath,
) {
  const record = deps.planner.desired(mount, digest, root);
  assertDesiredAvailable(deps.planner, deps.records(), record);
  return record;
}

export function prepareMountActivation(
  deps: PrepareDeps,
  record: MountRecord,
  actor = "system",
) {
  if (record.capabilities.length) {
    deps.persistence.audit(record, actor, "fetch", { outcome: "started" });
  }
  return prepared(deps, record, actor);
}

function prepared(deps: PrepareDeps, record: MountRecord, actor: string) {
  const current = deps.records().find((item) => item.id === record.id);
  return prepareRecord(deps.prepareServices, { record, current, actor });
}
