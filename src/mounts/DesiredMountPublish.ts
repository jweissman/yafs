import { AbsolutePath } from "../core/AbsolutePath";
import { MountManager } from "./MountManager";
import { Change } from "./DesiredMountChanges";
import { ManifestMount, PreparedMountRecord } from "./types";

export type Mutations = {
  mount(record: PreparedMountRecord): void;
  refresh(record: PreparedMountRecord): void;
  unmount(id: string): void;
};

export type Target = { mounts: MountManager; root: AbsolutePath };

export function applyChange(
  target: Target,
  change: Change,
  declarations: ManifestMount[],
  mutations: Mutations,
) {
  return change.action === "unmount"
    ? Promise.resolve(mutations.unmount(change.id))
    : publish(target, change, declarations, mutations);
}

async function publish(
  target: Target,
  change: Change,
  declarations: ManifestMount[],
  mutations: Mutations,
) {
  const record = recordFor(target, declarations, change.id);
  const prepared = await target.mounts.prepareActivation(record, "system");
  publishPrepared(change, mutations, prepared);
}

function recordFor(target: Target, declarations: ManifestMount[], id: string) {
  const mount = declaration(declarations, id);
  return target.mounts.planDesired(mount, digest(declarations), target.root);
}

function publishPrepared(
  change: Change,
  mutations: Mutations,
  record: PreparedMountRecord,
) {
  const publish =
    change.action === "activate" ? mutations.mount : mutations.refresh;
  publish(record);
}

function declaration(declarations: ManifestMount[], id: string) {
  const declaration = declarations.find((item) => item.id === id);
  if (!declaration) {
    throw new Error(`No desired mount: ${id}`);
  }
  return declaration;
}

function digest(declarations: ManifestMount[]) {
  return JSON.stringify(declarations);
}
