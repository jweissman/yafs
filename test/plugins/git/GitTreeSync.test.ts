import { expect, test } from "bun:test";

import {
  gitChildren,
  gitEntries,
  gitType,
} from "../../../src/plugins/git/GitTreeSync";
import { AbsolutePath } from "../../../src/core/AbsolutePath";

const PATHS = ["README.md", "lib/greeting.rb", "lib/nested/deep.rb"];
const ROOT = "/world/github/acme/widget/source" as AbsolutePath;

test("gitType is a directory for the root itself", () => {
  expect(gitType(PATHS, "")).toBe("directory");
});

test("gitType is a file for an exact path match", () => {
  expect(gitType(PATHS, "README.md")).toBe("file");
  expect(gitType(PATHS, "lib/nested/deep.rb")).toBe("file");
});

test("gitType is a directory for a path that's a prefix of other paths", () => {
  expect(gitType(PATHS, "lib")).toBe("directory");
  expect(gitType(PATHS, "lib/nested")).toBe("directory");
});

test("gitType is undefined for a path that doesn't exist at all", () => {
  expect(gitType(PATHS, "nonexistent")).toBeUndefined();
  expect(gitType(PATHS, "lib/nonexistent.rb")).toBeUndefined();
});

test("gitChildren lists direct children of the root, files and directories", () => {
  expect(gitChildren(PATHS, "").sort()).toEqual(["README.md", "lib"]);
});

test("gitChildren lists direct children of a subdirectory, deduplicated", () => {
  expect(gitChildren(PATHS, "lib").sort()).toEqual(["greeting.rb", "nested"]);
});

test("gitChildren is empty for a file path or an unknown path", () => {
  expect(gitChildren(PATHS, "README.md")).toEqual([]);
  expect(gitChildren(PATHS, "nonexistent")).toEqual([]);
});

test("gitEntries returns the full recursive tree with correct depth", () => {
  const entries = gitEntries(PATHS, "", ROOT);
  expect(entries).toEqual([
    { path: `${ROOT}/lib`, type: "directory", depth: 1 },
    { path: `${ROOT}/lib/greeting.rb`, type: "file", depth: 2 },
    { path: `${ROOT}/lib/nested`, type: "directory", depth: 2 },
    { path: `${ROOT}/lib/nested/deep.rb`, type: "file", depth: 3 },
    { path: `${ROOT}/README.md`, type: "file", depth: 1 },
  ]);
});

test("gitEntries scopes to a subdirectory, with depth relative to it", () => {
  const entries = gitEntries(PATHS, "lib", ROOT);
  expect(entries).toEqual([
    { path: `${ROOT}/lib/greeting.rb`, type: "file", depth: 1 },
    { path: `${ROOT}/lib/nested`, type: "directory", depth: 1 },
    { path: `${ROOT}/lib/nested/deep.rb`, type: "file", depth: 2 },
  ]);
});

test("gitEntries is empty for a subdirectory with no matching paths", () => {
  expect(gitEntries(PATHS, "nonexistent", ROOT)).toEqual([]);
});
