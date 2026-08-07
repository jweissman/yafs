import { agentConfig } from "../plugins/agent/AgentManifest";
import { MountManager } from "./MountManager";
import { PreparedMountRecord } from "./types";

export function activeEntries(mounts: MountManager) {
  return mounts.mounts().map((record) => activeEntry(record));
}

function activeEntry(record: PreparedMountRecord) {
  const entry = {
    id: record.id,
    plugin: record.provider,
    path: record.path,
    state: record.state,
  };
  return quarantined(record) ? { ...entry, quarantined: true } : entry;
}

function quarantined(record: PreparedMountRecord) {
  if (record.provider !== "agent") {
    return false;
  }
  try {
    agentConfig(record.config);
    return false;
  } catch {
    return true;
  }
}
