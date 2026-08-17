import { QuarantineInfo } from "../../mounts/MountAudit";
import { AgentConfig } from "../../mounts/types";
import { agentConfig } from "./AgentManifest";

export function quarantineInfo(id: string): QuarantineInfo {
  return {
    actor: "system",
    action: "quarantine",
    detail: `Invalid persisted agent configuration: ${id}`,
  };
}

export function validAgentConfig(config: unknown): AgentConfig | undefined {
  try {
    return agentConfig(config);
  } catch {
    return undefined;
  }
}
