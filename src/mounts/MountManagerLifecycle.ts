import { PreparedMountRecord } from "./types";
import { MountPersistence } from "./MountPersistence";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import {
  activateMount,
  refreshMount,
  removeMount,
  LifecycleDeps,
} from "./MountLifecycleOps";
import { auditUnmount } from "./MountAudit";

export interface LifecycleState {
  persistence: MountPersistence;
  snapshots: SnapshotMaterializer;
  getRecords: () => PreparedMountRecord[];
  setRecords: (records: PreparedMountRecord[]) => void;
  planUnmount: (id: string) => PreparedMountRecord;
}

export class MountLifecycleController {
  constructor(private readonly state: LifecycleState) {}

  activate(record: PreparedMountRecord, actor: string) {
    activateMount(this.deps(), record, actor);
  }

  refresh(record: PreparedMountRecord, actor: string, detail?: string) {
    const previous = this.state.planUnmount(record.id);
    refreshMount(this.deps(), { previous, record, actor, detail });
  }

  unmount(record: PreparedMountRecord, actor: string) {
    removeMount(this.deps(), record);
    auditUnmount(this.state.persistence, record, actor);
  }

  save() {
    const records = this.state.getRecords();
    this.state.persistence.save(records);
    return records;
  }

  private deps(): LifecycleDeps {
    const { persistence, snapshots, getRecords, setRecords } = this.state;
    return {
      persistence,
      snapshots,
      getRecords,
      setRecords,
      save: () => this.save(),
    };
  }
}
