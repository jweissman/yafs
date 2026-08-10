import { AbsolutePath } from "../core/AbsolutePath";
import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { SnapshotLimits, SnapshotMaterializer } from "./SnapshotMaterializer";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";
import { servicesFor, PrepareServices } from "./MountPreparation";
import { MountReplayer } from "./MountReplay";
import { resourceReference } from "./MountResourceReference";
import { auditQuarantine, auditUnmount } from "./MountAudit";
import { persistenceFor, plannerFor, replayerFor } from "./MountManagerBootstrap";
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
    this.bootstrapPersistence(statePath, auditPath);
    this.initServices(store, limits);
  }

  private bootstrapPersistence(statePath?: string, auditPath?: string) {
    this.persistence = persistenceFor(statePath, auditPath);
    this.records = this.persistence.restore();
  }

  private commitReplay(records: PreparedMountRecord[]) {
    this.records = records;
    this.save();
  }

  private initServices(store: NodeStore, limits?: SnapshotLimits) {
    this.planner = plannerFor(store, () => this.records, this.providers);
    this.snapshots = new SnapshotMaterializer(store, limits);
    this.initPrepareAndReplay();
  }

  private initPrepareAndReplay() {
    const { providers, persistence, snapshots } = this;
    this.prepareServices = servicesFor(providers, persistence, snapshots);
    const commit = this.commitReplay.bind(this);
    this.replay = replayerFor(() => this.snapshots, () => this.records, commit);
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
    return { planner, persistence, prepareServices, records };
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
    const record = this.records.find((item) => item.id === id);
    if (!record) {
      throw new Error(`No active mount: ${id}`);
    }
    return record;
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
    const { persistence, snapshots, save } = this;
    return {
      persistence,
      snapshots,
      getRecords: () => this.records,
      setRecords: (records) => (this.records = records),
      save: save.bind(this),
    };
  }
}
