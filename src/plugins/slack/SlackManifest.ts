import { SlackConfig } from "../../mounts/types";
import { object, only, relative } from "../../mounts/ManifestValidation";

export function slackConfig(value: unknown): SlackConfig {
  const config = object(value, "slack config");
  const fields = ["channel", "max", "persona", "requireMention"];
  only(config, fields, "slack config");
  assertValidChannel(config.channel);
  return parsedConfig(config);
}

function parsedConfig(config: Record<string, unknown>): SlackConfig {
  return {
    channel: config.channel as string,
    max: max(config.max),
    persona: persona(config.persona),
    requireMention: requireMention(config.requireMention),
  };
}

function requireMention(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error("Invalid slack requireMention");
  }
  return value;
}

function assertValidChannel(channel: unknown) {
  if (!relative(channel) || channel.includes("/")) {
    throw new Error("Invalid slack channel");
  }
}

function persona(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value) {
    throw new Error("Invalid slack persona");
  }
  return value;
}

function max(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (invalidMax(value)) {
    throw new Error("Invalid slack max");
  }
  return value as number;
}

function invalidMax(value: unknown) {
  return (
    !Number.isInteger(value) || (value as number) < 1 || (value as number) > 200
  );
}
