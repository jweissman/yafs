import { AbsolutePath } from "./core/AbsolutePath";
import { MountManager } from "./mounts/MountManager";
import { DesiredMounts } from "./mounts/DesiredMounts";
import { YafsOperationQueue } from "./YafsOperationQueue";
import {
  agentPersonaPath,
  listPersonas,
} from "./plugins/agent/AgentPersonaLookup";
import { slackPluginPath } from "./plugins/slack/SlackPluginLookup";
import { missingDesiredMounts } from "./mounts/MissingDesiredMounts";

export function mountContext(
  manager: MountManager,
  operations: YafsOperationQueue,
  desired?: DesiredMounts,
) {
  return {
    ...coreMountContext(manager, operations),
    ...desiredMounts(desired, operations),
  };
}

function coreMountContext(
  manager: MountManager,
  operations: YafsOperationQueue,
) {
  return {
    ...mountPlanning(manager),
    ...mountMutations(operations),
    ...pluginLookups(manager),
  };
}

function pluginLookups(manager: MountManager) {
  return {
    plugins: (name?: string) => manager.plugins(name),
    agentPersona: (reference: string) => agentPersonaPath(manager, reference),
    agentPersonas: () => listPersonas(manager),
    slackPlugin: (id: string) => slackPluginPath(manager, id),
  };
}

function mountPlanning(manager: MountManager) {
  return {
    ...resourceReferences(manager),
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

function resourceReferences(manager: MountManager) {
  return {
    resourceReference: (path: AbsolutePath) => manager.resourceReference(path),
  };
}

export function mountMutations(operations: YafsOperationQueue) {
  return {
    mount: (record) => operations.add({ type: "mount", record }),
    refresh: (record) => operations.add({ type: "refresh", record }),
    unmount: (id: string) => operations.add({ type: "unmount", id }),
  };
}
