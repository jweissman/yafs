import { SlackConfig } from "../../mounts/types";
import { object, only, relative } from "../../mounts/ManifestValidation";

export function slackConfig(value: unknown): SlackConfig {
  const config = object(value, "slack config");
  only(config, ["channel", "max", "persona"], "slack config");
  assertValidChannel(config.channel);
  return {
    channel: config.channel as string,
    max: max(config.max),
    persona: persona(config.persona),
  };
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
