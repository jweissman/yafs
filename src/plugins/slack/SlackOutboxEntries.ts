import { OutboxStatus } from "./SlackOutboxStatus";

export type OutboxId = { mountId: string; actionId: string };
export type Entry = [string, string];

export function messageEntry(id: OutboxId, message: string): Entry {
  return [`outbox/${id.actionId}/message.md`, message];
}

export function statusEntry(id: OutboxId, status: OutboxStatus): Entry {
  return [`outbox/${id.actionId}/status.json`, JSON.stringify(status)];
}
