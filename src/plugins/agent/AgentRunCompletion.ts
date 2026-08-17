import {
  detail,
  Entry,
  requestEntry,
  responseEntry,
  RunId,
  Status,
  statusEntry,
} from "./AgentRunEntries";

export function completeStatus(startedAt: string): Status {
  const completedAt = new Date().toISOString();
  return {
    state: "complete",
    startedAt,
    completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
  };
}

export function completion(
  id: RunId,
  startedAt: string,
  message: string,
  reply: string,
) {
  const status = completeStatus(startedAt);
  const updates = runFiles(id, status, message, reply);
  return { updates, entryDetail: detail(id, status) };
}

function runFiles(
  id: RunId,
  status: Status,
  message: string,
  reply: string,
): Entry[] {
  const request = requestEntry(id, message);
  return [statusEntry(id, status), request, responseEntry(id, reply)];
}
