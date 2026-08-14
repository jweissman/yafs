export type RunId = { mountId: string; personaName: string; runId: string };
export type Entry = [string, string];
export type Status = {
  state:
    "queued" | "running" | "complete" | "failed" | "interrupted" | "cancelled";
  startedAt: string;
  completedAt?: string;
  error?: string;
};

export function detail(id: RunId, status: Status): string {
  return `persona=${id.personaName} run=${id.runId} state=${status.state}`;
}

export function requestEntry(id: RunId, message: string): Entry {
  return [`${id.personaName}/runs/${id.runId}/request.md`, message];
}

export function responseEntry(id: RunId, reply: string): Entry {
  return [`${id.personaName}/runs/${id.runId}/response.md`, reply];
}

export function contextEntry(id: RunId, context: string): Entry {
  return [`${id.personaName}/runs/${id.runId}/context.md`, context];
}

export function toolsEntry(id: RunId, transcript: unknown): Entry {
  const path = `${id.personaName}/runs/${id.runId}/tools.json`;
  return [path, JSON.stringify(transcript)];
}

export function statusEntry(id: RunId, status: Status): Entry {
  return [
    `${id.personaName}/runs/${id.runId}/status.json`,
    JSON.stringify(status),
  ];
}
