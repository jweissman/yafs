import { NodeStore } from "./vfs/NodeStore";
import { User } from "./types/User";
import { Clock } from "./core/Clock";
import { MountManager } from "./mounts/MountManager";
import { BlobStore } from "./protocol/BlobStore";
import { TraceService } from "./traces/TraceService";
import { DesiredMounts } from "./mounts/DesiredMounts";
import { CacheService } from "./cache/CacheService";

export type YafsOptions = {
  store?: NodeStore;
  user?: User;
  clock?: Clock;
  mounts?: MountManager;
  blobs?: BlobStore;
  traces?: TraceService;
  cache?: CacheService;
  desired?: DesiredMounts;
};
