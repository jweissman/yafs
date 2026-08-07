import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openBlobStore } from "../src/protocol/BlobStore";
import { retainTraces } from "../src/traces/TraceRetention";
import { TraceFilesystem, TraceService } from "../src/traces/TraceService";
import { NodeStore } from "../src/vfs/NodeStore";

test("startup retention rebuild keeps durable trace blobs while ignoring ordinary trace-named files", async () => {
  const store = new NodeStore();
  store.mkdir("/source");
  store.write("/source/a.txt", "captured");
  store.mkdir("/artifacts");
  store.mkdir("/artifacts/one");
  store.mkdir("/ordinary");
  const blobs = openBlobStore(await directory());
  const traces = new TraceService(blobs);
  const trace = await traces.capture(filesystem(store), "/source");
  store.write("/artifacts/one/trace.json", JSON.stringify(trace));
  store.write("/ordinary/trace.json", "{}");
  store.mkdir("/corrupt");
  store.write("/corrupt/trace.json", "not json");
  retainTraces(store, traces);
  expect((await traces.gc()).reclaimed).toEqual([]);
  traces.release(trace, "trace:/artifacts/one");
  expect((await traces.gc()).reclaimed).toEqual([trace.entries[0].digest]);
});

function filesystem(store: NodeStore): TraceFilesystem {
  return {
    exists: (path) => !!store.get(path, false),
    type: (path) => store.type(path),
    list: (path) => store.list(path),
    read: (path) => store.read(path),
    mkdir: (path) => store.mkdir(path),
    write: (path, content) => store.write(path, content),
  };
}

function directory() {
  return mkdtemp(join(tmpdir(), "yafs-retention-"));
}
