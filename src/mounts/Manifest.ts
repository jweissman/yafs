import { createHash } from "node:crypto";
import { Manifest, ManifestMount } from "./types";
import { object, only } from "./ManifestValidation";
import { declarationsFor, pluginName } from "./ManifestPlugins";
import { decoded } from "./ManifestYaml";
import { pluginByName, resolvedPath } from "./ManifestMountPath";
import { interval } from "./ManifestRefreshInterval";
import { mountLabel, reason } from "./ManifestErrorContext";
import { validateMountFields } from "./ManifestMountFields";

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
    throw new Error(
      "Invalid manifest: expected { version: 1, plugins: [...] }",
    );
  }
  return { version: 1, mounts: declarations.map(validateMountAt) };
}

function validateMountAt(value: unknown, index: number): ManifestMount {
  try {
    return validateMount(value);
  } catch (error) {
    throw contextualized(error, value, index);
  }
}

function contextualized(error: unknown, value: unknown, index: number): Error {
  const label = mountLabel(value, index);
  return new Error(`Invalid mount ${label}: ${reason(error)}`, {
    cause: error,
  });
}

function validateMount(value: unknown): ManifestMount {
  const mount = object(value, "mount");
  only(
    mount,
    ["id", "path", "plugin", "provider", "config", "capabilities", "refresh"],
    "mount",
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
