import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { MountReplayer } from "./MountReplay";
import { servicesFor, PrepareServices } from "./MountPreparation";
import { PrepareDeps } from "./MountPreparationOps";
import { ProviderRegistry } from "./ProviderRegistry";
import {
  persistenceFor,
  plannerFor,
  replayerFor,
} from "./MountManagerBootstrap";
import { SnapshotLimits, SnapshotMaterializer } from "./SnapshotMaterializer";
import { PreparedMountRecord } from "./types";

export function prepDepsFor(
  planner: MountPlanner,
  persistence: MountPersistence,
  prepareServices: PrepareServices,
  records: () => PreparedMountRecord[],
): PrepareDeps {
  return { planner, persistence, prepareServices, records };
}

export function missingMount(id: string): never {
  throw new Error(`No active mount: ${id}`);
}

export type PrepareAndReplayDeps = {
  providers: ProviderRegistry;
  persistence: MountPersistence;
  snapshots: SnapshotMaterializer;
  getRecords: () => PreparedMountRecord[];
  commit: (records: PreparedMountRecord[]) => void;
};

export function buildPrepareAndReplay(deps: PrepareAndReplayDeps) {
  const { providers, persistence, snapshots, getRecords, commit } = deps;
  const prepareServices = servicesFor(providers, persistence, snapshots);
  const replay = replayerFor(() => snapshots, getRecords, commit);
  return { prepareServices, replay };
}

export type BootstrapBase = {
  store: NodeStore;
  statePath?: string;
  auditPath?: string;
  limits?: SnapshotLimits;
  providers: ProviderRegistry;
};

export type BootstrapOptions = BootstrapBase & {
  getRecords: () => PreparedMountRecord[];
  commit: (records: PreparedMountRecord[]) => void;
};

export type Bootstrapped = {
  persistence: MountPersistence;
  planner: MountPlanner;
  snapshots: SnapshotMaterializer;
  prepareServices: PrepareServices;
  replay: MountReplayer;
  records: PreparedMountRecord[];
};

export function bootstrapMountManager(o: BootstrapOptions): Bootstrapped {
  const persistence = persistenceFor(o.statePath, o.auditPath);
  const records = persistence.restore();
  const planner = plannerFor(o.store, o.getRecords, o.providers);
  const snapshots = new SnapshotMaterializer(o.store, o.limits);
  const { providers, getRecords, commit } = o;
  const deps = { providers, persistence, snapshots, getRecords, commit };
  const rest = buildPrepareAndReplay(deps);
  return { persistence, planner, snapshots, records, ...rest };
}
