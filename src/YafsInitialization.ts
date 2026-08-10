import { NodeStore } from "./vfs/NodeStore";
import { Shell } from "./Shell";
import { Interpreter } from "./lang/Interpreter";
import { systemClock } from "./core/Clock";
import { builtinCommands } from "./commands/registry";
import { MountManager } from "./mounts/MountManager";
import { YafsOperationQueue } from "./YafsOperationQueue";
import { YafsWorkspace } from "./YafsWorkspace";
import { memoryBlobStore } from "./protocol/MemoryBlobStore";
import { TraceService } from "./traces/TraceService";
import { CacheService } from "./cache/CacheService";
import type Yafs from "./index";
import type { YafsOptions } from "./index";

export function initializeYafs(yafs: Yafs, options: YafsOptions) {
  yafs.clock = options.clock || systemClock;
  yafs.store = options.store || new NodeStore(yafs.clock);
  initializeTraces(yafs, options);
  configure(yafs, options);
}

function initializeTraces(yafs: Yafs, options: YafsOptions) {
  yafs.blobs = options.blobs || memoryBlobStore();
  yafs.traces = options.traces || new TraceService(yafs.blobs);
  yafs.cache = options.cache || new CacheService(yafs.blobs);
}

function configure(yafs: Yafs, options: YafsOptions) {
  yafs.user = options.user || { name: "root" };
  configureMounts(yafs, options);
  initializeShell(yafs);
  initializeWorkspace(yafs);
  initializeOperations(yafs);
}

function configureMounts(yafs: Yafs, options: YafsOptions) {
  yafs.mounts = options.mounts || new MountManager(yafs.store);
  yafs.desired = options.desired;
}

function initializeWorkspace(yafs: Yafs) {
  yafs.workspace = new YafsWorkspace(yafs.shell, yafs.store, () =>
    yafs.mounts.mounts(),
  );
}

function initializeOperations(yafs: Yafs) {
  yafs.operationQueue = new YafsOperationQueue(
    yafs.store,
    yafs.mounts,
    yafs.clock,
    () => yafs.user.name,
  );
}

function initializeShell(yafs: Yafs) {
  yafs.shell = new Shell(yafs.user, yafs.store);
  yafs.interpreter = new Interpreter();
  registerBuiltins(yafs);
}

function registerBuiltins(yafs: Yafs) {
  yafs.builtins = new Map(
    builtinCommands().map((command) => [command.name, command]),
  );
}
