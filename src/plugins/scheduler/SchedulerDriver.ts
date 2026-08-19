import { Wiring } from "../../mounts/Plugin";
import { MountManager } from "../../mounts/MountManager";
import { SchedulerConfig } from "../../mounts/types";
import type Yafs from "../../index";
import { runScheduledScript } from "../../YafsScheduledRun";
import { logResult, requestFor, unchanged } from "./SchedulerDriverSupport";

interface Schedule {
  config: SchedulerConfig;
  timer: ReturnType<typeof setInterval>;
}

export class SchedulerDriver {
  private readonly mounts: MountManager;
  private schedules = new Map<string, Schedule>();

  constructor(
    private readonly wiring: Wiring,
    private readonly yafs: Yafs,
  ) {
    this.mounts = wiring.mounts;
  }

  close() {
    this.schedules.forEach((schedule) => {
      clearInterval(schedule.timer);
    });
    this.schedules.clear();
  }

  sync() {
    const active = new Set<string>();
    this.mounts.mounts().forEach((record) => {
      if (record.provider === "scheduler") {
        active.add(record.id);
        this.ensureSchedule(record.id, record.config as SchedulerConfig);
      }
    });
    this.clearStale(active);
  }

  private ensureSchedule(id: string, config: SchedulerConfig) {
    const existing = this.schedules.get(id);
    if (existing && unchanged(existing.config, config)) {
      return;
    }
    this.replaceTimer(id, config, existing);
  }

  private replaceTimer(
    id: string,
    config: SchedulerConfig,
    existing?: Schedule,
  ) {
    if (existing) {
      clearInterval(existing.timer);
    }
    this.schedules.set(id, { config, timer: this.createTimer(id, config) });
  }

  private createTimer(id: string, config: SchedulerConfig) {
    return setInterval(() => void this.tick(id, config), config.intervalMs);
  }

  private clearStale(active: Set<string>) {
    [...this.schedules.keys()]
      .filter((id) => !active.has(id))
      .forEach((id) => {
        this.discard(id);
      });
  }

  private discard(id: string) {
    const schedule = this.schedules.get(id);
    if (schedule) {
      clearInterval(schedule.timer);
    }
    this.schedules.delete(id);
  }

  private tick(id: string, config: SchedulerConfig): Promise<void> {
    return this.wiring.enqueue(() => this.run(id, config));
  }

  private async run(id: string, config: SchedulerConfig) {
    const result = await runScheduledScript(
      this.yafs,
      this.wiring.journal,
      this.wiring.dispatchCtl,
      requestFor(config),
    );
    logResult(id, result);
  }
}
