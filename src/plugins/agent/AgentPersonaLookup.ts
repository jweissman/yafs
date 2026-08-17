import { AbsolutePath } from "../../core/AbsolutePath";
import { PathResolver } from "../../core/PathResolver";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord } from "../../mounts/types";
import { validAgentConfig } from "./AgentConfigValidation";

const ROOT = "/home/root" as AbsolutePath;

export function agentPersonaPath(
  mounts: MountManager,
  reference: string,
): AbsolutePath {
  return resolvePersonaTarget(mounts, reference).personaPath;
}

function pathReference(mounts: MountManager, reference: string): PersonaTarget {
  const resolved = PathResolver.resolve(reference, ROOT);
  const record = mountFor(mounts, resolved);
  if (!record || !valid(record, resolved)) {
    throw new Error(`No such persona: ${reference}`);
  }
  return targetFrom(record, resolved);
}

function mountFor(mounts: MountManager, resolved: AbsolutePath) {
  return mounts.mounts().find((item) => resolved.startsWith(`${item.path}/`));
}

export interface PersonaTarget {
  personaPath: AbsolutePath;
  mountId: string;
  personaName: string;
}

// agentPersonaPath already proves a mount containing this persona exists
// (both pathReference and namedPersonaPath validate against mountFor/
// personas before returning), so the second mountFor lookup here is
// guaranteed to find the same record, not a fresh existence check.
export function resolvePersonaTarget(
  mounts: MountManager,
  reference: string,
): PersonaTarget {
  return reference.includes("/")
    ? pathReference(mounts, reference)
    : namedPersonaTarget(mounts, reference);
}

function targetFrom(
  record: PreparedMountRecord,
  personaPath: AbsolutePath,
): PersonaTarget {
  return {
    personaPath,
    mountId: record.id,
    personaName: personaPath.slice(record.path.length + 1),
  };
}

function valid(record: PreparedMountRecord, resolved: AbsolutePath) {
  return personas(record).includes(resolved.slice(record.path.length + 1));
}

function namedPersonaTarget(mounts: MountManager, name: string): PersonaTarget {
  const matches = mounts
    .mounts()
    .filter((record) => personas(record).includes(name));
  assertUnambiguous(matches.length, name);
  const record = matches[0];
  return targetFrom(record, `${record.path}/${name}` as AbsolutePath);
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

export interface PersonaListing {
  mountPath: string;
  persona: string;
}

export function listPersonas(mounts: MountManager): PersonaListing[] {
  return mounts.mounts().flatMap((record) => personaEntries(record));
}

function personaEntries(record: PreparedMountRecord): PersonaListing[] {
  return personas(record).map((persona) => ({
    mountPath: record.path,
    persona,
  }));
}
