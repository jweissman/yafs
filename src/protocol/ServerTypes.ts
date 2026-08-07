import { NodeStore } from "../vfs/NodeStore";
import { Journal } from "./Journal";
import { MountManager } from "../mounts/MountManager";
import { ProviderRegistry } from "../mounts/ProviderRegistry";
import { TraceReifier, TraceService } from "../traces/TraceService";
import { DesiredMounts as Desired } from "../mounts/DesiredMounts";
import { CacheService } from "../cache/CacheService";
import { ModelFor, SlackClientFor } from "./BackgroundDrivers";

export type StartOptions = {
  walPath?: string;
  dataDir?: string;
  port?: number;
  host?: string;
  providers?: ProviderRegistry;
  now?: () => number;
  traceReifier?: TraceReifier;
  modelFor?: ModelFor;
  slackClientFor?: SlackClientFor;
  configPath?: string;
  refreshIntervalMs?: number;
};

export type Services = {
  store: NodeStore;
  journal: Journal;
  mounts: MountManager;
  traces: TraceService;
  cache: CacheService;
  desired: Desired;
};
