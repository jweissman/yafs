import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord } from "../../mounts/types";
import { SlackOutboxStore } from "./SlackOutboxStore";
import { unknownStatus } from "./SlackOutboxStatus";

type Store = SlackOutboxStore;
type RecoverInput = {
  mountId: string;
  path: string;
  content: string;
  store: Store;
};

export async function recoverSlackOutbox(mounts: MountManager, store: Store) {
  for (const record of mounts.mounts()) {
    await recoverRecord(record, store);
  }
}

async function recoverRecord(record: PreparedMountRecord, store: Store) {
  if (record.provider !== "slack") {
    return;
  }
  for (const [path, content] of record.snapshot.entries) {
    await recoverEntry({ mountId: record.id, path, content, store });
  }
}

async function recoverEntry(input: RecoverInput) {
  const { mountId, path, content, store } = input;
  const action = pendingAction(path, content);
  if (!action) {
    return;
  }
  const id = { mountId, actionId: action.id };
  await store.writeStatus(id, unknownStatus(action.startedAt));
}

function pendingAction(path: string, content: string) {
  const match = /^outbox\/([^/]+)\/status\.json$/.exec(path);
  if (!match) {
    return undefined;
  }
  const status = JSON.parse(content) as { state?: string; startedAt?: unknown };
  return pendingState(status)
    ? { id: match[1], startedAt: status.startedAt }
    : undefined;
}

function pendingState(status: {
  state?: string;
  startedAt?: unknown;
}): status is { state: "queued" | "running"; startedAt: string } {
  return (
    (status.state === "queued" || status.state === "running") &&
    typeof status.startedAt === "string"
  );
}
