import { MountManager } from "../../mounts/MountManager";
import { PersonaToolsConfig } from "../../mounts/types";
import { ScopedMcpConfig } from "../../mcp/ScopedMcpClient";
import { agentTarget } from "./AgentTarget";
import { budgetsFor } from "./AgentToolServerBudgets";

export type Identity = { mountId: string; personaName: string };

export function identityFrom(pathname: string): Identity | undefined {
  const match = /^\/mcp\/([^/]+)\/([^/]+)$/.exec(pathname);
  return match ? { mountId: match[1], personaName: match[2] } : undefined;
}

export function scopedConfig(
  mounts: MountManager,
  identity: Identity,
): ScopedMcpConfig | undefined {
  const persona = personaTools(mounts, identity);
  return persona && budgetsFor(persona);
}

function personaTools(
  mounts: MountManager,
  { mountId, personaName }: Identity,
): PersonaToolsConfig | undefined {
  try {
    return agentTarget(mounts, mountId, personaName).persona.tools;
  } catch {
    return undefined;
  }
}
