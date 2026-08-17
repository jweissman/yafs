import { AbsolutePath } from "../core/AbsolutePath";
import { MountManager } from "./MountManager";
import { Change } from "./DesiredMountChanges";
import { ManifestMount, PreparedMountRecord } from "./types";

export interface Mutations {
  mount(record: PreparedMountRecord): void;
  refresh(record: PreparedMountRecord): void;
  unmount(id: string, path: AbsolutePath): void;
}

export interface Target {
  mounts: MountManager;
  root: AbsolutePath;
}

interface PreparedPublish {
  change: Change;
  mutations: Mutations;
  record: PreparedMountRecord;
}

export function applyChange(
  target: Target,
  change: Change,
  declarations: ManifestMount[],
  mutations: Mutations,
) {
  return change.action === "unmount"
    ? unmount(target, mutations, change.id)
    : publish(target, change, declarations, mutations);
}

function unmount(
  target: Target,
  mutations: Mutations,
  id: string,
): Promise<void> {
  mutations.unmount(id, target.mounts.planUnmount(id).path);
  return Promise.resolve();
}

async function publish(
  target: Target,
  change: Change,
  declarations: ManifestMount[],
  mutations: Mutations,
) {
  const record = recordFor(target, declarations, change.id);
  const prepared = await target.mounts.prepareActivation(record, "system");
  publishPrepared({ change, mutations, record: prepared });
}

function recordFor(target: Target, declarations: ManifestMount[], id: string) {
  const mount = declaration(declarations, id);
  return target.mounts.planDesired(mount, digest(declarations), target.root);
}

function publishPrepared({ change, mutations, record }: PreparedPublish) {
  if (change.action === "activate") {
    mutations.mount(record);
  } else {
    mutations.refresh(record);
  }
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
