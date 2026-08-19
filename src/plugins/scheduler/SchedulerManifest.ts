import { SchedulerConfig, CommandAccessName } from "../../mounts/types";
import { object, only } from "../../mounts/ManifestValidation";

const FIELDS = ["script", "intervalMs", "args", "allow"];
const ACCESS_NAMES: CommandAccessName[] = [
  "read",
  "session",
  "mutate",
  "control",
];

export function schedulerConfig(value: unknown): SchedulerConfig {
  const config = object(value, "scheduler config");
  only(config, FIELDS, "scheduler config");
  return validated(config);
}

interface Fields {
  script: unknown;
  intervalMs: unknown;
  args: unknown;
  allow: unknown;
}

function validated(config: Record<string, unknown>): SchedulerConfig {
  const { script, intervalMs, args, allow } = config;
  if (!valid({ script, intervalMs, args, allow })) {
    throw new Error("Invalid scheduler config");
  }
  return { script, intervalMs, args, allow } as SchedulerConfig;
}

function valid(fields: Fields): boolean {
  return (
    validScript(fields.script) &&
    validInterval(fields.intervalMs) &&
    validArgs(fields.args) &&
    validAllow(fields.allow)
  );
}

function validScript(script: unknown): boolean {
  return typeof script === "string" && script.startsWith("/");
}

function validInterval(intervalMs: unknown): boolean {
  return (
    typeof intervalMs === "number" &&
    Number.isInteger(intervalMs) &&
    intervalMs > 0
  );
}

function validArgs(args: unknown): boolean {
  return args === undefined || (Array.isArray(args) && args.every(isString));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validAllow(allow: unknown): boolean {
  return (
    Array.isArray(allow) &&
    allow.length > 0 &&
    allow.every((name) => ACCESS_NAMES.includes(name as CommandAccessName))
  );
}
