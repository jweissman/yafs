import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openBlobStore } from "../src/protocol/BlobStore";
import {
  Trace,
  TraceFilesystem,
  TraceService,
} from "../src/traces/TraceService";
import { NodeStore } from "../src/vfs/NodeStore";

test("a trace captures exact nested bytes and reifies them after source changes", async () => {
  const store = new NodeStore();
  store.mkdir("/source");
  store.mkdir("/source/nested");
  store.write("/source/nested/a.txt", "captured");
  const service = new TraceService(openBlobStore(await directory()));
  const files = filesystem(store);
  const trace = await service.capture(files, "/source");
  store.write("/source/nested/a.txt", "current");
  await service.materialize(files, trace, "/reified");
  expect(store.read("/reified/nested/a.txt")).toBe("captured");
});

test("a trace captures directories, not ambiguous single-file roots", async () => {
  const store = new NodeStore();
  store.write("/source.txt", "captured");
  const service = new TraceService(openBlobStore(await directory()));
  await expect(
    service.capture(filesystem(store), "/source.txt"),
  ).rejects.toThrow("Trace source must be a directory");
});

test("reification rejects a manifest entry that escapes its destination", async () => {
  const store = new NodeStore();
  const service = new TraceService(openBlobStore(await directory()));
  await expect(
    service.materialize(filesystem(store), trace("../outside.txt"), "/reified"),
  ).rejects.toThrow("Invalid trace entry path");
  expect(store.get("/outside.txt", false)).toBeUndefined();
});

test("a pinned provider hook can restore a missing blob without reading the current source", async () => {
  const store = new NodeStore();
  store.mkdir("/source");
  store.write("/source/a.txt", "captured");
  const blobs = openBlobStore(await directory());
  const captured = await new TraceService(blobs).capture(
    filesystem(store),
    "/source",
  );
  captured.resourceReference = { revision: "immutable-one" };
  await blobs.gc();
  let calls = 0;
  const service = new TraceService(blobs, {
    reify: async () => {
      calls++;
      return new TextEncoder().encode("captured");
    },
  });
  await service.materialize(filesystem(store), captured, "/reified");
  expect(store.read("/reified/a.txt")).toBe("captured");
  expect(calls).toBe(1);
});

test("a reifier cannot substitute bytes for a trace digest", async () => {
  const store = new NodeStore();
  store.mkdir("/source");
  store.write("/source/a.txt", "captured");
  const blobs = openBlobStore(await directory());
  const captured = await new TraceService(blobs).capture(
    filesystem(store),
    "/source",
  );
  captured.resourceReference = { revision: "immutable-one" };
  await blobs.gc();
  const service = new TraceService(blobs, {
    reify: async () => new TextEncoder().encode("wrong"),
  });
  await expect(
    service.materialize(filesystem(store), captured, "/reified"),
  ).rejects.toThrow("wrong content");
});

function trace(path: string): Trace {
  return {
    kind: "yafs-trace",
    version: 1,
    sourcePath: "/source",
    capturedAt: "2026-08-04T00:00:00.000Z",
    entries: [{ path, digest: "0".repeat(64) }],
  };
}

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
  return mkdtemp(join(tmpdir(), "yafs-trace-"));
}
