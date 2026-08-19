import { expect, test } from "bun:test";

import {
  emptySnapshot,
  fetchedRecord,
  sourceMarker,
} from "../../../src/plugins/github/GitHubFetchedRecord";
import { MountRecord } from "../../../src/mounts/types";

test("sourceMarker publishes exactly one entry when the mirror synced", () => {
  expect(sourceMarker({ sha: "abc123", paths: ["a.txt", "b.txt"] })).toEqual([
    ["source/.git-source", ""],
  ]);
});

test("sourceMarker publishes nothing when host.git-read wasn't granted", () => {
  expect(sourceMarker({ sha: undefined, paths: undefined })).toEqual([]);
});

test("emptySnapshot has no entries and a stable sentinel revision", () => {
  const snapshot = emptySnapshot();
  expect(snapshot.entries).toEqual([]);
  expect(snapshot.revision).toBe("github:none");
});

test("fetchedRecord merges the collection snapshot and mirror result onto the record", () => {
  const base = {
    id: "review",
    revision: "old-rev",
    sourceRevision: undefined,
    sourcePaths: undefined,
  } as unknown as MountRecord;
  const snapshot = {
    entries: [],
    revision: "github:new",
    fetchedAt: "2026-08-19T00:00:00Z",
    resourceReferences: {},
  };

  const result = fetchedRecord(base, snapshot, { sha: "abc", paths: ["x"] });

  expect(result.revision).toBe("github:new");
  expect(result.fetchedAt).toBe("2026-08-19T00:00:00Z");
  expect(result.sourceRevision).toBe("abc");
  expect(result.sourcePaths).toEqual(["x"]);
});
