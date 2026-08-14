import { object, only } from "./ManifestValidation";

export function interval(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const refresh = object(value, "refresh");
  only(refresh, ["interval"], "refresh");
  return intervalValue(refresh.interval);
}

function intervalValue(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Invalid refresh interval");
  }
  const match = /^(\d+)(m|h)$/.exec(value);
  if (!match) {
    throw new Error("Invalid refresh interval");
  }
  return Number(match[1]) * (match[2] === "h" ? 60 : 1) * 60_000;
}
