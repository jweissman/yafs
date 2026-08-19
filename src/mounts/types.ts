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
export interface GitHubPullsConfig {
  query: string;
  max: number;
}
export interface GitHubConfig {
  repository: string;

  pulls?: GitHubPullsConfig;
  commits?: { max: number };
}

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

  reactions?: boolean;
}

export interface SchedulerConfig {
  script: string;
  intervalMs: number;
  args?: string[];
  allow: CommandAccessName[];
}
export type CommandAccessName = "read" | "session" | "mutate" | "control";
export type MountProvider =
  "fixture" | "github" | "agent" | "slack" | "scheduler";
export type MountConfig =
  FixtureConfig | GitHubConfig | AgentConfig | SlackConfig | SchedulerConfig;
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

  sourceRevision?: string;

  sourcePaths?: string[];
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
