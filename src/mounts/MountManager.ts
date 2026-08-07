import { AbsolutePath } from "../core/AbsolutePath";
import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { SnapshotLimits, SnapshotMaterializer } from "./SnapshotMaterializer";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";
import {
  prepareRecord,
  servicesFor,
  PrepareServices,
} from "./MountPreparation";
import { assertDesiredAvailable, restoredRefresh } from "./MountRestore";
import { MountReplayer } from "./MountReplay";
import { resourceReference } from "./MountResourceReference";
import {
  auditActivation,
  auditQuarantine,
  auditRefresh,
  auditUnmount,
} from "./MountAudit";

export class MountManager {
  private records: PreparedMountRecord[] = [];
  private readonly persistence: MountPersistence;
  private readonly planner: MountPlanner;
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
    this.persistence = this.persistenceFor(statePath, auditPath);
    this.records = this.persistence.restore();
    this.planner = this.createPlanner(store);
    this.initServices(store, limits);
  }

  private commitReplay(records: PreparedMountRecord[]) {
    this.records = records;
    this.save();
  }

  private initServices(store: NodeStore, limits?: SnapshotLimits) {
    this.snapshots = new SnapshotMaterializer(store, limits);
    this.prepareServices = servicesFor(
      this.providers,
      this.persistence,
      this.snapshots,
    );
    this.replay = this.buildReplayer();
  }

  private buildReplayer() {
    const commit = this.commitReplay.bind(this);
    return new MountReplayer(
      () => this.snapshots,
      () => this.records,
      commit,
    );
  }

  private persistenceFor(statePath?: string, auditPath?: string) {
    return new MountPersistence(statePath, auditPath);
  }

  private createPlanner(store: NodeStore) {
    return new MountPlanner(store, () => this.records, this.providers);
  }

  validate(path: AbsolutePath) {
    return this.planner.validate(path);
  }
  planActivation(path: AbsolutePath, id?: string) {
    return this.planner.plan(path, id);
  }
  planDesired(mount: ManifestMount, digest: string, root: AbsolutePath) {
    const record = this.planner.desired(mount, digest, root);
    assertDesiredAvailable(this.planner, this.records, record);
    return record;
  }
  prepareActivation(record: MountRecord, actor = "system") {
    if (record.capabilities.length) {
      this.persistence.audit(record, actor, "fetch", { outcome: "started" });
    }
    return this.prepared(record, actor);
  }
  prepareRefresh(path: AbsolutePath, id?: string, actor?: string) {
    return this.prepareActivation(this.planner.refresh(path, id), actor);
  }
  prepareRefreshRecord(record: MountRecord, actor = "system") {
    return this.prepareActivation(record, actor);
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
    this.snapshots.materialize(record);
    this.records.push(record);
    this.save();
    auditActivation(this.persistence, record, actor);
  }

  refresh(record: PreparedMountRecord, actor: string, detail?: string) {
    const previous = this.planUnmount(record.id);
    this.snapshots.replace(record);
    this.records = restoredRefresh(this.snapshots, this.records, record);
    this.save();
    auditRefresh(this.persistence, record, actor, previous.revision, detail);
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
    this.remove(record);
    auditUnmount(this.persistence, record, actor);
  }

  private save() {
    this.persistence.save(this.records);
  }
  private prepared(record: MountRecord, actor: string) {
    const current = this.records.find((item) => item.id === record.id);
    return prepareRecord(this.prepareServices, record, current, actor);
  }

  private remove(record: MountRecord) {
    this.snapshots.remove(record);
    this.records = this.records.filter((item) => item !== record);
    this.save();
  }
}
