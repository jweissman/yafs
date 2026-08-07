import { expect, test } from "bun:test";

import { GitHubTraceReifier } from "../src/plugins/github/GitHubTraceReifier";
import { digest, Trace } from "../src/traces/TraceService";

test("a GitHub trace reifier refetches the pinned pull and returns the entry matching the requested digest", async () => {
  const reifier = new GitHubTraceReifier(fakeClient());
  const trace = traceFor("diff.patch", "diff --git");
  expect(await reifier.reify(trace, trace.entries[0].digest)).toEqual(
    new TextEncoder().encode("diff --git"),
  );
});

test("a GitHub trace reifier reconstructs metadata.json identically to how it was captured", async () => {
  const reifier = new GitHubTraceReifier(fakeClient());
  const metadata = JSON.stringify({
    number: 42,
    title: "Trace me",
    updatedAt: "2026-08-03T00:00:00Z",
    headSha: "abc123",
  });
  const trace = traceFor("metadata.json", metadata);
  expect(await reifier.reify(trace, trace.entries[0].digest)).toEqual(
    new TextEncoder().encode(metadata),
  );
});

test("a GitHub trace reifier declines a trace with no GitHub resource reference", async () => {
  const reifier = new GitHubTraceReifier(fakeClient());
  const trace = {
    ...traceFor("diff.patch", "diff --git"),
    resourceReference: undefined,
  };
  expect(await reifier.reify(trace, trace.entries[0].digest)).toBeUndefined();
});

test("a GitHub trace reifier declines an unrecognized digest", async () => {
  const reifier = new GitHubTraceReifier(fakeClient());
  const trace = traceFor("diff.patch", "diff --git");
  expect(await reifier.reify(trace, "f".repeat(64))).toBeUndefined();
});

function fakeClient() {
  return {
    pull: async (repository: string, number: number) => ({
      number,
      title: "Trace me",
      updatedAt: "2026-08-03T00:00:00Z",
      headSha: "abc123",
      diff: "diff --git",
    }),
  };
}

function traceFor(path: string, content: string): Trace {
  return {
    kind: "yafs-trace",
    version: 1,
    sourcePath: "/home/root/reviews/pulls/42",
    capturedAt: "2026-08-03T00:00:00Z",
    resourceReference: {
      kind: "github-pr",
      repository: "acme/widget",
      number: 42,
      headSha: "abc123",
    },
    entries: [{ path, digest: digest(new TextEncoder().encode(content)) }],
  };
}
