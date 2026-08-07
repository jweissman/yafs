import { dirname } from "node:path";
import { Server } from "node:net";

import { NodeStore } from "../vfs/NodeStore";
import { VfsOperation } from "../vfs/VfsOperation";
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

type Paths = ReturnType<typeof mountPaths>;

export function replay(mounts: MountManager) {
  return (operation: VfsOperation) => replayOperation(mounts, operation);
}
function replayOperation(mounts: MountManager, operation: VfsOperation) {
  if (operation.type === "mount") {
    mounts.replay.activation(operation.record);
  }
  if (operation.type === "refresh") {
    mounts.replay.refresh(operation.record);
  }
  if (operation.type === "unmount") {
    mounts.replay.unmount(operation.id);
  }
}
type Base = { store: NodeStore; mounts: MountManager };

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
  return new TraceService(blobs, options.traceReifier || defaultTraceReifier());
}
async function finishServices(
  base: Base,
  traces: TraceService,
  cache: CacheService,
  options: StartOptions,
) {
  const { store, mounts } = base;
  const journal = await openJournal(base, options);
  retainTraces(store, traces);
  retainCaches(store, cache);
  return { store, mounts, journal, traces, cache };
}
function openJournal(base: Base, options: StartOptions) {
  return Journal.open(journalPath(options), base.store, replay(base.mounts));
}
function mountManager(store: NodeStore, paths: Paths, options: StartOptions) {
  const providers = options.providers || defaultProviders();
  return new MountManager(
    store,
    paths.state,
    paths.audit,
    undefined,
    providers,
  );
}
export function listen(server: Server, options: StartOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port || 0, options.host || "127.0.0.1", resolve);
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
  const directory = options.dataDir || dirname(journalPath(options));
  return {
    directory,
    state: `${directory}/mounts.json`,
    audit: `${directory}/audit.ndjson`,
  };
}
