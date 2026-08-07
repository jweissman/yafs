import { PreparedMountRecord } from "./types";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import {
  restoredActivation,
  restoredRefresh,
  restoredUnmount,
} from "./MountRestore";

export class MountReplayer {
  constructor(
    private readonly snapshots: () => SnapshotMaterializer,
    private readonly records: () => PreparedMountRecord[],
    private readonly commit: (records: PreparedMountRecord[]) => void,
  ) {}

  activation(record: PreparedMountRecord) {
    const updated = restoredActivation(
      this.snapshots(),
      this.records(),
      record,
    );
    if (updated !== this.records()) {
      this.commit(updated);
    }
  }

  refresh(record: PreparedMountRecord) {
    this.commit(restoredRefresh(this.snapshots(), this.records(), record));
  }

  unmount(id: string) {
    this.commit(restoredUnmount(this.snapshots(), this.records(), id));
  }
}
