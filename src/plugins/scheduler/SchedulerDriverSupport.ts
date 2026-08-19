import { AbsolutePath } from "../../core/AbsolutePath";
import { CommandAccess } from "../../commands/BuiltinCommand";
import { SchedulerConfig } from "../../mounts/types";
import { log } from "../../Logging";
import { ScheduledRunResult } from "../../YafsScheduledRun";

const schedulerLog = log.getSubLogger({ name: "scheduler" });

export function requestFor(config: SchedulerConfig) {
  return {
    path: config.script as AbsolutePath,
    args: config.args ?? [],
    allow: config.allow as CommandAccess[],
  };
}

export function unchanged(
  previous: SchedulerConfig,
  next: SchedulerConfig,
): boolean {
  return JSON.stringify(previous) === JSON.stringify(next);
}

export function logResult(id: string, result: ScheduledRunResult) {
  if (result.error) {
    schedulerLog.error({ id, error: result.error }, "scheduler tick failed");
  } else if (result.output) {
    schedulerLog.info({ id, output: result.output }, "scheduler tick");
  }
}
