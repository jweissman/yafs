import { AbsolutePath } from "../core/AbsolutePath";
import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { SnapshotLimits, SnapshotMaterializer } from "./SnapshotMaterializer";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";
import { prepareRecord } from "./MountPreparation";
import {
  assertDesiredAvailable,
  restoredActivation,
  restoredRefresh,
  restoredUnmount,
} from "./MountRestore";
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
  private readonly snapshots: SnapshotMaterializer;

  constructor(
    store: NodeStore,
    statePath?: string,
    auditPath?: string,
    limits?: SnapshotLimits,
    private readonly providers = new ProviderRegistry(),
  ) {
    this.persistence = this.persistenceFor(statePath, auditPath);
    this.records = this.restore();
    this.planner = this.createPlanner(store);
    this.snapshots = new SnapshotMaterializer(store, limits);
  }

  private persistenceFor(statePath?: string, auditPath?: string) {
    return new MountPersistence(statePath, auditPath);
  }
  private restore() {
    return this.persistence.restore();
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
    const record = this.records.find((item) =>
      path.startsWith(`${item.path}/`),
    );
    return record?.snapshot.resourceReferences?.[
      path.slice(record.path.length + 1)
    ];
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

  restoreOperation(record: PreparedMountRecord) {
    const updated = restoredActivation(this.snapshots, this.records, record);
    if (updated !== this.records) {
      this.records = updated;
      this.save();
    }
  }

  restoreRefresh(record: PreparedMountRecord) {
    this.records = restoredRefresh(this.snapshots, this.records, record);
    this.save();
  }

  restoreUnmount(id: string) {
    this.records = restoredUnmount(this.snapshots, this.records, id);
    this.save();
  }

  private save() {
    this.persistence.save(this.records);
  }
  private prepared(record: MountRecord, actor: string) {
    const current = this.records.find((item) => item.id === record.id);
    return prepareRecord(
      this.providers,
      this.persistence,
      this.snapshots,
      record,
      current,
      actor,
    );
  }
  private remove(record: MountRecord) {
    this.snapshots.remove(record);
    this.records = this.records.filter((item) => item !== record);
    this.save();
  }
}
