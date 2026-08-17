import { parseJson } from "./json";

interface Origin {
  kind?: string;
  mountId?: string;
  provider?: string;
  revision?: string;
}

export function inspectedOrigin(source: string): Origin {
  const value = parseJson(source);
  if (!hasOrigins(value) || !value.origins[0]) {
    throw new Error("Expected inspection output with at least one origin");
  }
  return origin(value.origins[0]);
}

function hasOrigins(value: unknown): value is { origins: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "origins" in value &&
    Array.isArray(value.origins)
  );
}

function origin(value: unknown): Origin {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected an inspection origin object");
  }
  return {
    kind: stringField(value, "kind"),
    mountId: stringField(value, "mountId"),
    provider: stringField(value, "provider"),
    revision: stringField(value, "revision"),
  };
}

function stringField(value: object, key: string): string | undefined {
  return key in value && typeof value[key] === "string"
    ? value[key]
    : undefined;
}
