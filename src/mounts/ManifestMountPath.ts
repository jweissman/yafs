import { ManifestMount } from "./types";
import { relative } from "./ManifestValidation";
import { pluginKinds } from "./PluginKinds";

export function pathOrAbsent(value: unknown): boolean {
  return value === undefined || relative(value);
}

export function resolvedPath(
  mount: Record<string, unknown>,
  provider: ManifestMount["provider"],
  parsedConfig: unknown,
): string {
  const explicit = mount.path as string | undefined;
  return explicit ?? defaultPath(provider, parsedConfig);
}

function defaultPath(
  provider: ManifestMount["provider"],
  parsedConfig: unknown,
): string {
  const computed = pluginByName(provider).defaultPath(parsedConfig as never);
  return computed ?? missingPath(provider);
}

function missingPath(provider: ManifestMount["provider"]): never {
  throw new Error(
    `${provider} mounts have no default path for this config — path: is required`,
  );
}

export function pluginByName(name: string) {
  const plugin = pluginKinds().find((candidate) => candidate.name === name);
  if (!plugin) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return plugin;
}
