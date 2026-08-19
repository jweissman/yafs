import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gitBacking } from "../../../src/plugins/git/GitBacking";
import { PreparedMountRecord } from "../../../src/mounts/types";

function githubRecord(overrides: Partial<PreparedMountRecord> = {}) {
  return {
    id: "review",
    path: "/world/github/acme/widget",
    provider: "github",
    config: { repository: "acme/widget" },
    manifestPath: "/dev/null",
    manifestDigest: "digest",
    revision: "rev-1",
    state: "active",
    activatedAt: "2026-08-01T00:00:00Z",
    correlationId: "corr-1",
    capabilities: ["network.github-api", "host.git-read"],
    sourceRevision: "abc123",
    sourcePaths: ["lib/a.rb", "lib/b.rb"],
    snapshot: { entries: [], fileCount: 0, byteCount: 0 },
    ...overrides,
  } as PreparedMountRecord;
}

test("gitBacking matches a path under a granted github mount's source/ subtree", () => {
  const record = githubRecord();
  const path = "/world/github/acme/widget/source/lib/a.rb";

  const backing = gitBacking([record], path);

  expect(backing).toEqual({
    mirrorDir: join(tmpdir(), "yafs-git-mirrors", "review"),
    sha: "abc123",
    relativePath: "lib/a.rb",
    mountRoot: "/world/github/acme/widget/source",
    paths: ["lib/a.rb", "lib/b.rb"],
  });
});

test("gitBacking is undefined for pulls/ or commits/ paths on the same mount", () => {
  const record = githubRecord();

  expect(
    gitBacking([record], "/world/github/acme/widget/pulls/1/metadata.json"),
  ).toBeUndefined();
});

test("gitBacking is undefined without the host.git-read capability", () => {
  const record = githubRecord({ capabilities: ["network.github-api"] });

  expect(
    gitBacking([record], "/world/github/acme/widget/source/lib/a.rb"),
  ).toBeUndefined();
});

test("gitBacking is undefined for a non-github mount", () => {
  const record = githubRecord({ provider: "fixture" as never });

  expect(
    gitBacking([record], "/world/github/acme/widget/source/lib/a.rb"),
  ).toBeUndefined();
});

test("gitBacking defaults paths to an empty array when sourcePaths is unset", () => {
  const record = githubRecord({ sourcePaths: undefined });

  const backing = gitBacking([record], "/world/github/acme/widget/source");

  expect(backing?.paths).toEqual([]);
});

test("gitBacking is undefined before the first successful sync sets sourceRevision", () => {
  const record = githubRecord({ sourceRevision: undefined });

  expect(
    gitBacking([record], "/world/github/acme/widget/source/lib/a.rb"),
  ).toBeUndefined();
});
