import { AbsolutePath } from "../core/AbsolutePath";
import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { SnapshotLimits, SnapshotMaterializer } from "./SnapshotMaterializer";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";
import { PrepareServices } from "./MountPreparation";
import { MountReplayer } from "./MountReplay";
import { resourceReference } from "./MountResourceReference";
import { auditQuarantine, auditUnmount } from "./MountAudit";
import {
  planDesiredMount,
  prepareMountActivation,
  PrepareDeps,
} from "./MountPreparationOps";
import {
  activateMount,
  refreshMount,
  removeMount,
  LifecycleDeps,
} from "./MountLifecycleOps";
import {
  prepDepsFor,
  missingMount,
  bootstrapMountManager,
  BootstrapBase,
  Bootstrapped,
} from "./MountManagerDeps";

export class MountManager {
  private records: PreparedMountRecord[] = [];
  private persistence: MountPersistence;
  private planner: MountPlanner;
  private snapshots: SnapshotMaterializer;
  private prepareServices: PrepareServices;
  replay: MountReplayer;

  constructor(
    store: NodeStore,
    statePath?: string,
    auditPath?: string,
    limits?: SnapshotLimits,
    private readonly providers = new ProviderRegistry(),
  ) {
    const base = { store, statePath, auditPath, limits, providers };
    this.apply(bootstrapMountManager(this.withCallbacks(base)));
  }

  private withCallbacks(base: BootstrapBase) {
    return {
      ...base,
      getRecords: () => this.records,
      commit: this.commitReplay.bind(this),
    };
  }

  private apply(bootstrapped: Bootstrapped) {
    this.persistence = bootstrapped.persistence;
    this.planner = bootstrapped.planner;
    this.snapshots = bootstrapped.snapshots;
    this.prepareServices = bootstrapped.prepareServices;
    this.replay = bootstrapped.replay;
    this.records = bootstrapped.records;
  }

  private commitReplay(records: PreparedMountRecord[]) {
    this.records = records;
    this.save();
  }

  planDesired(mount: ManifestMount, digest: string, root: AbsolutePath) {
    return planDesiredMount(this.prepDeps(), mount, digest, root);
  }
  prepareActivation(record: MountRecord, actor = "system") {
    return prepareMountActivation(this.prepDeps(), record, actor);
  }
  prepareRefreshRecord(record: MountRecord, actor = "system") {
    return this.prepareActivation(record, actor);
  }
  private prepDeps(): PrepareDeps {
    const { planner, persistence, prepareServices } = this;
    const records = () => this.records;
    return prepDepsFor(planner, persistence, prepareServices, records);
  }
  mounts() {
    return [...this.records];
  }
  plugins(name?: string) {
    return this.providers.describe(name);
  }
  audit(
    record: PreparedMountRecord,
    actor: string,
    action: string,
    detail: string,
  ) {
    auditQuarantine(this.persistence, record, actor, action, detail);
  }
  resourceReference(path: AbsolutePath) {
    return resourceReference(this.records, path);
  }

  activate(record: PreparedMountRecord, actor: string) {
    activateMount(this.lifecycleDeps(), record, actor);
  }

  refresh(record: PreparedMountRecord, actor: string, detail?: string) {
    const previous = this.planUnmount(record.id);
    refreshMount(this.lifecycleDeps(), { previous, record, actor, detail });
  }

  planUnmount(id: string): PreparedMountRecord {
    return this.records.find((item) => item.id === id) || missingMount(id);
  }

  unmount(id: string, actor: string) {
    const record = this.planUnmount(id);
    removeMount(this.lifecycleDeps(), record);
    auditUnmount(this.persistence, record, actor);
  }

  private save() {
    this.persistence.save(this.records);
  }

  private lifecycleDeps(): LifecycleDeps {
    return {
      persistence: this.persistence,
      snapshots: this.snapshots,
      getRecords: () => this.records,
      setRecords: (records) => (this.records = records),
      save: () => this.save(),
    };
  }
}
