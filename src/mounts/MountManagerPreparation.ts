import { AbsolutePath } from "../core/AbsolutePath";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { PrepareServices } from "./MountPreparation";
import {
  planDesiredMount,
  prepareMountActivation,
} from "./MountPreparationOps";
import { prepDepsFor } from "./MountManagerDeps";

export interface PreparationState {
  planner: MountPlanner;
  persistence: MountPersistence;
  prepareServices: PrepareServices;
  getRecords: () => PreparedMountRecord[];
}

export function desiredPlan(
  state: PreparationState,
  mount: ManifestMount,
  digest: string,
  root: AbsolutePath,
) {
  return planDesiredMount(deps(state), mount, digest, root);
}

export function activationPrep(
  state: PreparationState,
  record: MountRecord,
  actor: string,
) {
  return prepareMountActivation(deps(state), record, actor);
}

function deps(state: PreparationState) {
  const { planner, persistence, prepareServices, getRecords } = state;
  return prepDepsFor(planner, persistence, prepareServices, getRecords);
}
