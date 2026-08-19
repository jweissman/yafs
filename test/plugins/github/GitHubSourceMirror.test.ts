import { expect, test } from "bun:test";

import { syncSourceMirror } from "../../../src/plugins/github/GitHubSourceMirror";
import { GitResult, RunGit } from "../../../src/plugins/git/GitProcess";
import { MountRecord } from "../../../src/mounts/types";
import { loggedEntries } from "../../logging_helpers";

function fakeRunGit(calls: string[][]): RunGit {
  return async (args: string[]) => {
    calls.push(args);
    return response(args);
  };
}

function response(args: string[]): GitResult {
  if (args[0] === "rev-parse") {
    return ok("abc123sha\n");
  }
  if (args[0] === "ls-tree") {
    return ok("lib/a.rb\nlib/b.rb\n");
  }
  return ok("");
}

function ok(stdout: string): GitResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function record(): MountRecord {
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
  };
}

test("syncSourceMirror authenticates the fetch and returns the flat path list", async () => {
  const calls: string[][] = [];
  const settings = {
    apiUrl: "https://api.example.com",
    webUrl: "https://example.com",
    token: "secret-token",
  };

  const result = await syncSourceMirror(settings, record(), fakeRunGit(calls));

  expect(result.sha).toBe("abc123sha");
  expect(result.paths).toEqual(["lib/a.rb", "lib/b.rb"]);
  const fetchCall = calls.find((args) => args.includes("fetch"));
  expect(fetchCall).toContain("-c");

  const remoteAdd = calls.find((args) => args[0] === "remote");
  expect(remoteAdd).toEqual([
    "remote",
    "add",
    "origin",
    "https://example.com/acme/widget.git",
  ]);
});

test("syncSourceMirror works without a configured token, no auth header sent", async () => {
  const calls: string[][] = [];
  const settings = {
    apiUrl: "https://api.example.com",
    webUrl: "https://example.com",
  };

  await syncSourceMirror(settings, record(), fakeRunGit(calls));

  const fetchCall = calls.find((args) => args.includes("fetch"));
  expect(fetchCall).not.toContain("-c");
});

function failingRunGit(): RunGit {
  return async (args: string[]) => {
    return args[0] === "fetch"
      ? { stdout: "", stderr: "fatal: could not resolve host", exitCode: 128 }
      : response(args);
  };
}

test("syncSourceMirror logs and rethrows on a real sync failure", async () => {
  const settings = { apiUrl: "https://api.example.com", webUrl: "https://example.com" };

  const entries = await loggedEntries(async () => {
    await expect(
      syncSourceMirror(settings, record(), failingRunGit()),
    ).rejects.toThrow("fatal: could not resolve host");
  });

  expect(
    entries.some(
      (entry) =>
        entry.message === "mirror sync failed" && entry.mountId === "review",
    ),
  ).toBe(true);
});
