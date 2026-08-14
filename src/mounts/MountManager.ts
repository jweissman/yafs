import { AbsolutePath } from "../core/AbsolutePath";
import { NodeStore } from "../vfs/NodeStore";
import { MountPersistence } from "./MountPersistence";
import { MountPlanner } from "./MountPlanner";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";
import { PrepareServices } from "./MountPreparation";
import { MountReplayer } from "./MountReplay";
import { resourceReference } from "./MountResourceReference";
import { auditQuarantine, QuarantineInfo } from "./MountAudit";
import {
  activationPrep,
  desiredPlan,
  PreparationState,
} from "./MountManagerPreparation";
import { MountLifecycleController } from "./MountManagerLifecycle";
import {
  missingMount,
  initializeManager,
  Bootstrapped,
  MountManagerOptions,
} from "./MountManagerDeps";

export type { MountManagerOptions } from "./MountManagerDeps";

export class MountManager {
  private records: PreparedMountRecord[] = [];
  private persistence: MountPersistence;
  private planner: MountPlanner;
  private snapshots: SnapshotMaterializer;
  private prepareServices: PrepareServices;
  private readonly providers: ProviderRegistry;
  private lifecycle: MountLifecycleController;
  replay: MountReplayer;

  constructor(store: NodeStore, options: MountManagerOptions = {}) {
    this.providers = options.providers ?? new ProviderRegistry();
    const callbacks = {
      getRecords: () => this.records,
      commit: (records: PreparedMountRecord[]) => this.commitReplay(records),
    };
    this.apply(initializeManager(store, options, this.providers, callbacks));
  }

  private apply(bootstrapped: Bootstrapped) {
    this.persistence = bootstrapped.persistence;
    this.planner = bootstrapped.planner;
    this.snapshots = bootstrapped.snapshots;
    this.prepareServices = bootstrapped.prepareServices;
    this.replay = bootstrapped.replay;
    this.records = bootstrapped.records;
    this.lifecycle = this.buildLifecycle();
  }

  private preparationState(): PreparationState {
    const { planner, persistence, prepareServices } = this;
    const getRecords = () => this.records;
    return { planner, persistence, prepareServices, getRecords };
  }

  private buildLifecycle(): MountLifecycleController {
    return new MountLifecycleController({
      persistence: this.persistence,
      snapshots: this.snapshots,
      getRecords: () => this.records,
      setRecords: (records) => (this.records = records),
      planUnmount: (id) => this.planUnmount(id),
    });
  }

  private commitReplay(records: PreparedMountRecord[]) {
    this.records = records;
    this.lifecycle.save();
  }

  planDesired(mount: ManifestMount, digest: string, root: AbsolutePath) {
    return desiredPlan(this.preparationState(), mount, digest, root);
  }
  prepareActivation(record: MountRecord, actor = "system") {
    return activationPrep(this.preparationState(), record, actor);
  }
  mounts() {
    return [...this.records];
  }
  plugins(name?: string) {
    return this.providers.describe(name);
  }
  audit(record: PreparedMountRecord, info: QuarantineInfo) {
    auditQuarantine(this.persistence, record, info);
  }
  resourceReference(path: AbsolutePath) {
    return resourceReference(this.records, path);
  }

  activate(record: PreparedMountRecord, actor: string) {
    this.lifecycle.activate(record, actor);
  }

  refresh(record: PreparedMountRecord, actor: string, detail?: string) {
    this.lifecycle.refresh(record, actor, detail);
  }

  planUnmount(id: string): PreparedMountRecord {
    return this.records.find((item) => item.id === id) || missingMount(id);
  }

  unmount(id: string, actor: string) {
    this.lifecycle.unmount(this.planUnmount(id), actor);
  }
}
