import { AbsolutePath } from "../core/AbsolutePath";

export type MountState = "active" | "failed";
export type StreamSpec = { chunks: string[]; intervalMs: number };
export type FixtureConfig = {
  files: Record<string, string>;
  streams?: Record<string, StreamSpec>;
};
export type GitHubConfig = { repository: string; query: string; max: number };
export type PersonaConfig = {
  prompt: string;
  endpoint?: string;
  model?: string;
};
export type AgentConfig = {
  personas: Record<string, PersonaConfig>;
  endpoint?: string;
  model?: string;
};
export type SlackConfig = {
  channel: string;
  max?: number;
  persona?: string;
  requireMention?: boolean;
};
export type MountProvider = "fixture" | "github" | "agent" | "slack";
export type MountConfig =
  FixtureConfig | GitHubConfig | AgentConfig | SlackConfig;
export type PublishedSnapshot = {
  entries: [string, string][];
  fileCount: number;
  byteCount: number;
  resourceReferences?: Record<string, object>;
};

export type MountRecord = {
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
};
export type PreparedMountRecord = MountRecord & { snapshot: PublishedSnapshot };

export type ManifestMount = {
  id: string;
  path: string;
  provider: MountProvider;
  config: MountConfig;
  capabilities: string[];
  refreshIntervalMs?: number;
};
export type Manifest = { version: 1; mounts: ManifestMount[] };

export type Provenance = {
  kind: "local" | "provider";
  path: string;
  mountId?: string;
  provider?: string;
  revision?: string;
  activatedAt?: string;
  fetchedAt?: string;
};
