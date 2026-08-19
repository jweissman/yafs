import { Plugin, Wiring, PluginDriver } from "../../mounts/Plugin";
import { schedulerConfig } from "./SchedulerManifest";
import { SchedulerDriver } from "./SchedulerDriver";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import { MountRecord, SchedulerConfig } from "../../mounts/types";
import type Yafs from "../../index";

const SCHEDULE_CAPABILITY = "control.scheduled-execution";

export interface SchedulerDriverConfig {
  yafs: Yafs;
}

export class SchedulerPlugin extends Plugin {
  readonly name = "scheduler" as const;

  constructor(private readonly driverConfig?: SchedulerDriverConfig) {
    super();
  }

  capabilities() {
    return [SCHEDULE_CAPABILITY];
  }

  parseConfig(value: unknown) {
    return schedulerConfig(value);
  }

  createDriver(wiring: Wiring): PluginDriver[] {
    if (!this.driverConfig) {
      return [];
    }
    return [new SchedulerDriver(wiring, this.driverConfig.yafs)];
  }

  prepare(record: MountRecord, snapshots: SnapshotMaterializer) {
    const config = record.config as SchedulerConfig;
    const entries: [string, string][] = [
      ["config.json", JSON.stringify(config, null, 2)],
    ];
    return snapshots.prepare(record, entries);
  }
}
