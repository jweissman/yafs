import { ManifestMount } from "./types";
import { pluginKinds } from "./PluginKinds";
import { pathOrAbsent } from "./ManifestMountPath";
import { pluginName } from "./ManifestPlugins";

export function validateMountFields(mount: Record<string, unknown>) {
  assertId(mount.id);
  assertPath(mount.path);
  assertProvider(pluginName(mount));
  assertCapabilities(mount.capabilities);
}

// "--all" is reserved by `plugin deactivate --all` — a mount actually
// named that would be permanently undeactivatable by id (every reference
// to it would instead be parsed as the bulk flag).
function assertId(id: unknown): void {
  if (typeof id !== "string") {
    throw new Error("id must be a string");
  }
  if (id === "--all") {
    throw new Error('id must not be "--all" (reserved by plugin deactivate)');
  }
}

function assertPath(path: unknown) {
  if (!pathOrAbsent(path)) {
    throw new Error("path must be a relative path with no .. segments");
  }
}

function assertProvider(name: unknown) {
  if (!isProvider(name)) {
    throw new Error(`unknown provider: ${JSON.stringify(name)}`);
  }
}

function isProvider(value: unknown): value is ManifestMount["provider"] {
  return pluginKinds().some((plugin) => plugin.name === value);
}

function assertCapabilities(capabilities: unknown) {
  const valid =
    Array.isArray(capabilities) &&
    capabilities.every((capability) => typeof capability === "string");
  if (!valid) {
    throw new Error("capabilities must be an array of strings");
  }
}
