import { createHash } from "node:crypto";
import { Manifest, ManifestMount } from "./types";
import { fixtureStreams } from "./FixtureStreamManifest";
import { agentConfig } from "../agents/AgentManifest";
import { slackConfig } from "./SlackManifest";
import { githubConfig } from "./GitHubManifest";
import { object, only, relative } from "./ManifestValidation";
import { declarationsFor, pluginName } from "./ManifestPlugins";
import { decoded } from "./ManifestYaml";

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
    ...mountIdentity(mount, provider),
    config: config(provider, mount.config),
    capabilities: mount.capabilities as string[],
    refreshIntervalMs: interval(mount.refresh),
  };
}

function mountIdentity(
  mount: Record<string, unknown>,
  provider: ManifestMount["provider"],
) {
  return { id: mount.id as string, path: mount.path as string, provider };
}

function config(provider: ManifestMount["provider"], value: unknown) {
  if (provider === "fixture") {
    return fixture(value);
  }
  if (provider === "agent") {
    return agentConfig(value);
  }
  return provider === "slack" ? slackConfig(value) : githubConfig(value);
}

function validateMountFields(mount: Record<string, unknown>) {
  assertIdentity(mount);
  assertCapabilities(mount);
}

function assertIdentity(mount: Record<string, unknown>) {
  if (
    typeof mount.id !== "string" ||
    !relative(mount.path) ||
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

function fixture(value: unknown) {
  const config = object(value, "fixture config");
  only(config, ["files", "streams"], "fixture config");
  const files = validFixtureFiles(config.files);
  return { files, streams: fixtureStreams(config.streams) };
}

function validFixtureFiles(value: unknown) {
  const files = object(value, "fixture files");
  const valid = Object.entries(files).every(
    (entry) => relative(entry[0]) && typeof entry[1] === "string",
  );
  if (!valid) {
    throw new Error("Invalid fixture files");
  }
  return files as Record<string, string>;
}

function provider(value: unknown): value is ManifestMount["provider"] {
  return (
    value === "fixture" ||
    value === "github" ||
    value === "agent" ||
    value === "slack"
  );
}

function interval(value: unknown) {
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
