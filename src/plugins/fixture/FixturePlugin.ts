import { Plugin, Wiring, PluginDriver } from "../../mounts/Plugin";
import { FixtureProvider } from "./FixtureProvider";
import { fixtureConfig } from "./FixtureManifest";
import { FixtureStreamDriver } from "./FixtureStreamDriver";
import { carryForward } from "../../mounts/SnapshotCarryForward";
import { SnapshotMaterializer } from "../../mounts/SnapshotMaterializer";
import {
  FixtureConfig,
  MountRecord,
  PreparedMountRecord,
} from "../../mounts/types";

export class FixturePlugin extends Plugin {
  readonly name = "fixture" as const;

  constructor() {
    super();
  }

  capabilities() {
    return [];
  }

  parseConfig(value: unknown) {
    return fixtureConfig(value);
  }

  createDriver(wiring: Wiring): PluginDriver {
    return new FixtureStreamDriver(wiring);
  }

  prepare(
    record: MountRecord,
    snapshots: SnapshotMaterializer,
    current?: PreparedMountRecord,
  ) {
    const config = record.config as FixtureConfig;
    const fresh = FixtureProvider.from(config).entries();
    const isStreamed = (path: string) => Boolean(config.streams?.[path]);
    return snapshots.prepare(record, carryForward(fresh, current, isStreamed));
  }
}
