import { AbsolutePath } from "../core/AbsolutePath";

export type MountState = "active" | "failed";
export interface StreamSpec {
  chunks: string[];
  intervalMs: number;
}
export interface FixtureConfig {
  files: Record<string, string>;
  streams?: Record<string, StreamSpec>;
}
export interface GitHubConfig {
  repository: string;
  query: string;
  max: number;
}
// Declares this persona has bounded MCP tool access. Yafs runs its own
// scoped MCP HTTP server (AgentToolServer) and points LM Studio at it via
// an `ephemeral_mcp` integration computed automatically per request — the
// operator never edits LM Studio's mcp.json or hand-authors an
// `integrations` list; `roots`/budgets here are the whole contract.
export interface PersonaToolsConfig {
  roots: string[];
  maxResultBytes?: number;
  maxCalls?: number;
  deadlineMs?: number;
}
export interface PersonaConfig {
  prompt: string;
  endpoint?: string;
  model?: string;
  tools?: PersonaToolsConfig;
}
export interface AgentConfig {
  personas: Record<string, PersonaConfig>;
  endpoint?: string;
  model?: string;
}
export interface SlackConfig {
  channel: string;
  max?: number;
  persona?: string;
  requireMention?: boolean;
  replyTimeoutMs?: number;
  // Adding/removing the "working" reaction needs a separate OAuth scope
  // (reactions:write) beyond posting/reading messages. Default true to
  // match existing behavior; set false for a bot token that doesn't have
  // that scope, instead of failing (and logging) on every message.
  reactions?: boolean;
}
export type MountProvider = "fixture" | "github" | "agent" | "slack";
export type MountConfig =
  FixtureConfig | GitHubConfig | AgentConfig | SlackConfig;
export interface PublishedSnapshot {
  entries: [string, string][];
  fileCount: number;
  byteCount: number;
  resourceReferences?: Record<string, object>;
}

export interface MountRecord {
  id: string;
  path: AbsolutePath;
  provider: MountProvider;
  config: MountConfig;
  manifestPath: AbsolutePath;
  manifestDigest: string;
  revision: string;
  state: MountState;
  activatedAt: string;
  correlationId: string;
  refreshIntervalMs?: number;
  fetchedAt?: string;
  capabilities: string[];
}
export type PreparedMountRecord = MountRecord & { snapshot: PublishedSnapshot };

export interface ManifestMount {
  id: string;
  path: string;
  provider: MountProvider;
  config: MountConfig;
  capabilities: string[];
  refreshIntervalMs?: number;
}
export interface Manifest {
  version: 1;
  mounts: ManifestMount[];
}

export interface Provenance {
  kind: "local" | "provider";
  path: string;
  mountId?: string;
  provider?: string;
  revision?: string;
  activatedAt?: string;
  fetchedAt?: string;
}
