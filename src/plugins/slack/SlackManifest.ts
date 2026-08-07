import { SlackConfig } from "../../mounts/types";
import { object, only, relative } from "../../mounts/ManifestValidation";

export function slackConfig(value: unknown): SlackConfig {
  const config = object(value, "slack config");
  only(config, ["channel", "max"], "slack config");
  if (!relative(config.channel) || config.channel.includes("/")) {
    throw new Error("Invalid slack channel");
  }
  return { channel: config.channel, max: max(config.max) };
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
