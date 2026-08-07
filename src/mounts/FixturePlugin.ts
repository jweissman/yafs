import { FixtureProvider } from "./FixtureProvider";
import { ProviderDefinition } from "./ProviderDefinition";
import { carryForward } from "./SnapshotCarryForward";
import { SnapshotMaterializer } from "./SnapshotMaterializer";
import { FixtureConfig, MountRecord, PreparedMountRecord } from "./types";

export function fixtureDefinition(): ProviderDefinition {
  return { name: "fixture", capabilities: () => [], prepare: fixtureSnapshot };
}

function fixtureSnapshot(
  record: MountRecord,
  snapshots: SnapshotMaterializer,
  current?: PreparedMountRecord,
) {
  const config = record.config as FixtureConfig;
  const fresh = FixtureProvider.from(config).entries();
  return snapshots.prepare(
    record,
    carryForward(fresh, current, (path) => Boolean(config.streams?.[path])),
  );
}
