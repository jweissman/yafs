import { dirname } from "node:path";
import { Server } from "node:net";

import { NodeStore } from "../vfs/NodeStore";
import { MountManager } from "../mounts/MountManager";
import { defaultProviders } from "../mounts/defaultProviders";
import { Journal } from "./Journal";
import { StartOptions } from "./server";
import { openBlobStore } from "./BlobStore";
import { TraceService } from "../traces/TraceService";
import { retainTraces } from "../traces/TraceRetention";
import { defaultTraceReifier } from "../plugins/github/GitHubTraceReifier";
import { CacheService } from "../cache/CacheService";
import { retainCaches } from "../cache/CacheRetention";
import { replay } from "./ServerMountReplay";

type Paths = ReturnType<typeof mountPaths>;

interface Base {
  store: NodeStore;
  mounts: MountManager;
}

export async function openServices(options: StartOptions) {
  const store = new NodeStore();
  const paths = mountPaths(options);
  const mounts = mountManager(store, paths, options);
  return services({ store, mounts }, paths, options);
}
async function services(base: Base, paths: Paths, options: StartOptions) {
  const blobs = openBlobStore(`${paths.directory}/blobs`);
  const traces = traceService(blobs, options);
  return finishServices(base, traces, new CacheService(blobs), options);
}
function traceService(
  blobs: ReturnType<typeof openBlobStore>,
  options: StartOptions,
) {
  return new TraceService(blobs, options.traceReifier ?? defaultTraceReifier());
}
async function finishServices(
  base: Base,
  traces: TraceService,
  cache: CacheService,
  options: StartOptions,
) {
  const journal = await openJournal(base, options);
  retain(base.store, traces, cache);
  return { ...base, journal, traces, cache };
}

function retain(store: NodeStore, traces: TraceService, cache: CacheService) {
  retainTraces(store, traces);
  retainCaches({ store, cache });
}
function openJournal(base: Base, options: StartOptions) {
  return Journal.open(journalPath(options), base.store, replay(base.mounts));
}
function mountManager(store: NodeStore, paths: Paths, options: StartOptions) {
  const providers = options.providers ?? defaultProviders();
  return new MountManager(store, {
    statePath: paths.state,
    auditPath: paths.audit,
    providers,
    limits: options.snapshotLimits,
  });
}
export function listen(server: Server, options: StartOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve);
  });
}
function journalPath(options: StartOptions) {
  if (options.walPath) {
    return options.walPath;
  }
  if (!options.dataDir) {
    throw new Error("walPath or dataDir is required");
  }
  return `${options.dataDir}/journal.ndjson`;
}
function mountPaths(options: StartOptions) {
  const directory = options.dataDir ?? dirname(journalPath(options));
  return {
    directory,
    state: `${directory}/mounts.json`,
    audit: `${directory}/audit.ndjson`,
  };
}
