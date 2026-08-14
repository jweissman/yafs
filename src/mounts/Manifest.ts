import { createHash } from "node:crypto";
import { Manifest, ManifestMount } from "./types";
import { object, only } from "./ManifestValidation";
import { declarationsFor, pluginName } from "./ManifestPlugins";
import { decoded } from "./ManifestYaml";
import { pluginKinds } from "./PluginKinds";
import { pathOrAbsent, pluginByName, resolvedPath } from "./ManifestMountPath";
import { interval } from "./ManifestRefreshInterval";

export function parseManifest(source: string): {
  manifest: Manifest;
  digest: string;
} {
  const manifest = validateManifest(decoded(source));
  return {
    manifest,
    digest: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
  };
}

function validateManifest(value: unknown): Manifest {
  const root = object(value, "manifest");
  only(root, ["version", "plugins", "mounts"], "manifest");
  return manifestFor(root);
}
function manifestFor(root: Record<string, unknown>): Manifest {
  const declarations = declarationsFor(root);
  if (root.version !== 1 || !Array.isArray(declarations)) {
    throw new Error("Invalid .yafsmeta manifest");
  }
  return { version: 1, mounts: declarations.map(validateMount) };
}

function validateMount(value: unknown): ManifestMount {
  const mount = object(value, "plugin");
  only(
    mount,
    ["id", "path", "plugin", "provider", "config", "capabilities", "refresh"],
    "plugin",
  );
  validateMountFields(mount);
  return validatedMount(mount);
}

function validatedMount(mount: Record<string, unknown>): ManifestMount {
  const provider = pluginName(mount) as ManifestMount["provider"];
  return {
    ...identity(mount, provider),
    capabilities: mount.capabilities as string[],
    refreshIntervalMs: interval(mount.refresh),
  };
}

type Provider = ManifestMount["provider"];

function identity(mount: Record<string, unknown>, provider: Provider) {
  const parsedConfig = config(provider, mount.config);
  return {
    id: mount.id as string,
    path: resolvedPath(mount, provider, parsedConfig),
    provider,
    config: parsedConfig,
  };
}

function config(provider: ManifestMount["provider"], value: unknown) {
  return pluginByName(provider).parseConfig(value);
}

function validateMountFields(mount: Record<string, unknown>) {
  assertIdentity(mount);
  assertCapabilities(mount);
}

function assertIdentity(mount: Record<string, unknown>) {
  if (
    typeof mount.id !== "string" ||
    !pathOrAbsent(mount.path) ||
    !provider(pluginName(mount))
  ) {
    throw new Error("Invalid .yafsmeta plugin");
  }
}

function assertCapabilities(mount: Record<string, unknown>) {
  if (
    !Array.isArray(mount.capabilities) ||
    !mount.capabilities.every((capability) => typeof capability === "string")
  ) {
    throw new Error("Invalid .yafsmeta capabilities");
  }
}

function provider(value: unknown): value is ManifestMount["provider"] {
  return pluginKinds().some((plugin) => plugin.name === value);
}
