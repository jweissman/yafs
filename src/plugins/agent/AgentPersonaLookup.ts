import { AbsolutePath } from "../../core/AbsolutePath";
import { PathResolver } from "../../core/PathResolver";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord } from "../../mounts/types";
import { validAgentConfig } from "./AgentRegistration";

const ROOT = "/home/root" as AbsolutePath;

export function agentPersonaPath(
  mounts: MountManager,
  reference: string,
): AbsolutePath {
  return reference.includes("/")
    ? pathReference(mounts, reference)
    : namedPersonaPath(mounts, reference);
}

function pathReference(mounts: MountManager, reference: string): AbsolutePath {
  const resolved = PathResolver.resolve(reference, ROOT);
  const record = mountFor(mounts, resolved);
  if (!record || !valid(record, resolved)) {
    throw new Error(`No such persona: ${reference}`);
  }
  return resolved;
}

function mountFor(mounts: MountManager, resolved: AbsolutePath) {
  return mounts.mounts().find((item) => resolved.startsWith(`${item.path}/`));
}

function valid(record: PreparedMountRecord, resolved: AbsolutePath) {
  return personas(record).includes(resolved.slice(record.path.length + 1));
}

function namedPersonaPath(mounts: MountManager, name: string): AbsolutePath {
  const matches = mounts
    .mounts()
    .filter((record) => personas(record).includes(name));
  assertUnambiguous(matches.length, name);
  return `${matches[0].path}/${name}` as AbsolutePath;
}

function assertUnambiguous(count: number, name: string) {
  if (!count) {
    throw new Error(`No such persona: ${name}`);
  }
  if (count > 1) {
    throw new Error(`Ambiguous persona ${name}; give its full path instead`);
  }
}

function personas(record: PreparedMountRecord): string[] {
  if (record.provider !== "agent") {
    return [];
  }
  const config = validAgentConfig(record.config);
  return config ? Object.keys(config.personas) : [];
}
