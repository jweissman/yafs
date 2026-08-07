import { AbsolutePath } from "./core/AbsolutePath";
import { MountManager } from "./mounts/MountManager";
import { DesiredMounts } from "./mounts/DesiredMounts";
import { YafsOperationQueue } from "./YafsOperationQueue";
import { agentPersonaPath } from "./agents/AgentPersonaLookup";
import { slackPluginPath } from "./mounts/SlackPluginLookup";

export function mountContext(
  manager: MountManager,
  operations: YafsOperationQueue,
  desired?: DesiredMounts,
) {
  return {
    ...mountPlanning(manager),
    ...mountMutations(operations),
    ...desiredMounts(desired, operations),
    ...pluginLookups(manager),
  };
}

function pluginLookups(manager: MountManager) {
  return {
    plugins: (name?: string) => manager.plugins(name),
    agentPersona: (reference: string) => agentPersonaPath(manager, reference),
    slackPlugin: (id: string) => slackPluginPath(manager, id),
  };
}

function mountPlanning(manager: MountManager) {
  return {
    ...mountActivation(manager),
    ...resourceReferences(manager),
    planRefresh: (path: AbsolutePath, id?: string) =>
      manager.prepareRefresh(path, id),
    planUnmount: (id: string) => manager.planUnmount(id),
  };
}

function desiredMounts(
  desired: DesiredMounts | undefined,
  operations: YafsOperationQueue,
) {
  return desired
    ? configuredDesiredMounts(desired, operations)
    : missingDesiredMounts();
}

function configuredDesiredMounts(
  desired: DesiredMounts,
  operations: YafsOperationQueue,
) {
  return {
    ...desiredReads(desired),
    ...desiredMutations(desired, mountMutations(operations)),
  };
}

function desiredReads(desired: DesiredMounts) {
  return {
    desiredStatus: () => desired.status(),
    desiredPlan: () => desired.plan(),
  };
}

function desiredMutations(
  desired: DesiredMounts,
  mutations: ReturnType<typeof mountMutations>,
) {
  return {
    applyDesired: (prune = false) => desired.apply(mutations, prune),
    refreshDesired: (id: string) => desired.refreshOne(id, mutations),
  };
}

function missingDesiredMounts() {
  const missing = () =>
    Promise.reject(new Error("No daemon mount configuration"));
  return {
    desiredStatus: () => Promise.resolve({ configured: false }),
    desiredPlan: () => Promise.resolve([]),
    applyDesired: missing,
    refreshDesired: missing,
  };
}

function resourceReferences(manager: MountManager) {
  return {
    resourceReference: (path: AbsolutePath) => manager.resourceReference(path),
  };
}

function mountActivation(manager: MountManager) {
  return {
    planMount: (path: AbsolutePath, id?: string) =>
      manager.planActivation(path, id),
    prepareMount: (record) => manager.prepareActivation(record),
  };
}

export function mountMutations(operations: YafsOperationQueue) {
  return {
    mount: (record) => operations.add({ type: "mount", record }),
    refresh: (record) => operations.add({ type: "refresh", record }),
    unmount: (id: string) => operations.add({ type: "unmount", id }),
  };
}
