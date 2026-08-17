import { MountManager } from "../../mounts/MountManager";
import {
  AgentConfig,
  PersonaConfig,
  PreparedMountRecord,
} from "../../mounts/types";
import { validAgentConfig } from "./AgentConfigValidation";

export interface AgentTarget {
  config: AgentConfig;
  persona: PersonaConfig;
}
export interface RunContext {
  mountId: string;
  personaName: string;
  runId: string;
  startedAt: string;
}

export function agentTarget(
  mounts: MountManager,
  mountId: string,
  personaName: string,
): AgentTarget {
  const record = agentRecord(mounts, mountId);
  assertGranted(record);
  const config = configuredAgent(record);
  return { config, persona: requiredPersona(config, personaName) };
}

function requiredPersona(
  config: AgentConfig,
  personaName: string,
): PersonaConfig {
  if (!Object.hasOwn(config.personas, personaName)) {
    throw new Error(`No such persona: ${personaName}`);
  }
  const persona = config.personas[personaName];
  return persona;
}

function configuredAgent(record: PreparedMountRecord) {
  const config = validAgentConfig(record.config);
  if (!config) {
    throw new Error(`Invalid persisted agent configuration: ${record.id}`);
  }
  return config;
}

function agentRecord(
  mounts: MountManager,
  mountId: string,
): PreparedMountRecord {
  const record = mounts.mounts().find((item) => item.id === mountId);
  if (!record) {
    throw new Error(`No such mount: ${mountId}`);
  }
  return record;
}

function assertGranted(record: PreparedMountRecord) {
  if (!record.capabilities.includes("chat.completion")) {
    throw new Error(`chat.completion is not granted: ${record.id}`);
  }
}
