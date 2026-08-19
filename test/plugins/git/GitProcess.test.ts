import { expect, test } from "bun:test";

import { required, RunGit } from "../../../src/plugins/git/GitProcess";

function failingRunGit(): RunGit {
  return async () => ({ stdout: "", stderr: "fatal: boom", exitCode: 1 });
}

test("required redacts an http.extraheader arg from a failed command's error message", async () => {
  const args = [
    "-c",
    "http.extraheader=AUTHORIZATION: basic c2VjcmV0LXRva2Vu",
    "fetch",
    "origin",
  ];

  await expect(required(failingRunGit(), args)).rejects.toThrow(
    "git -c http.extraheader=<redacted> fetch origin failed: fatal: boom",
  );
});

test("required's error message is unredacted for a command with no auth header", async () => {
  await expect(
    required(failingRunGit(), ["rev-parse", "HEAD"]),
  ).rejects.toThrow("git rev-parse HEAD failed: fatal: boom");
});
