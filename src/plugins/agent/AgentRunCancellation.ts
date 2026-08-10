import { MountManager } from "../../mounts/MountManager";
import { AgentRunStore } from "./AgentRunStore";

export class AgentRunCancellation {
  private readonly cancelled = new Set<string>();

  constructor(
    private readonly mounts: MountManager,
    private readonly runs: AgentRunStore,
  ) {}

  async cancel(mountId: string, personaName: string, runId: string) {
    const startedAt = this.startedAt(mountId, personaName, runId);
    this.cancelled.add(this.key(mountId, runId));
    const status = this.cancelledStatus(startedAt);
    await this.runs.cancel({ mountId, personaName, runId }, status);
  }

  private cancelledStatus(startedAt: string) {
    return {
      state: "cancelled" as const,
      startedAt,
      completedAt: new Date().toISOString(),
      error: "Cancelled by operator",
    };
  }

  cancelledRun(mountId: string, runId: string) {
    return this.cancelled.has(this.key(mountId, runId));
  }

  private startedAt(mountId: string, persona: string, runId: string) {
    const content = this.entry(mountId, `${persona}/runs/${runId}/status.json`);
    const startedAt =
      content && (JSON.parse(content) as { startedAt?: unknown }).startedAt;
    if (typeof startedAt !== "string") {
      throw new Error(`No active run: ${runId}`);
    }
    return startedAt;
  }

  private entry(mountId: string, path: string) {
    const record = this.mounts.mounts().find((item) => item.id === mountId);
    return record?.snapshot.entries.find(([entry]) => entry === path)?.[1];
  }

  private key(mountId: string, runId: string) {
    return `${mountId}:${runId}`;
  }
}

export function cancelId(payload: string) {
  const value = (JSON.parse(payload) as { cancel?: unknown }).cancel;
  return typeof value === "string" ? value : undefined;
}
