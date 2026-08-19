import { MountRecord } from "../../mounts/types";

export function configurationError(record: MountRecord): string {
  return record.capabilities.includes("secret.github-token")
    ? tokenUnavailable(record)
    : `GitHub plugin '${record.id}' has no GitHub source configured.`;
}

export function tokenUnavailable(record: Pick<MountRecord, "id">): string {
  return (
    `GitHub plugin '${record.id}' requires secret.github-token, but ` +
    "YAFS_GITHUB_TOKEN was unavailable when yafsd started. Add it to the " +
    "daemon environment, or remove the grant for a public collection."
  );
}
