import { NodeType } from "../operations/WorkspaceOperation";

export function pathValue(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error("path must be an absolute Yafs path");
  }
  return value;
}

export function paths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("paths must be an array");
  }
  return value.map(requiredString);
}

export function requiredString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("value must be a string");
  }
  return value;
}

export function predicate(value: unknown): "-e" | "-f" | "-d" | "-L" {
  if (value === "-e" || value === "-f" || value === "-d" || value === "-L") {
    return value;
  }
  throw new Error("predicate must be one of -e, -f, -d, -L");
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || typeof value === "string") {
    return value;
  }
  throw new Error("value must be a string");
}

export function optionalInteger(value: unknown): number | undefined {
  if (value === undefined || Number.isInteger(value)) {
    return value as number | undefined;
  }
  throw new Error("value must be an integer");
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || typeof value === "boolean") {
    return value;
  }
  throw new Error("value must be a boolean");
}

export function optionalType(value: unknown): NodeType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "file" || value === "directory" || value === "symlink") {
    return value;
  }
  throw new Error("type must be file, directory, or symlink");
}
