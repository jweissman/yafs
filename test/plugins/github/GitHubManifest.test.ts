import { expect, test } from "bun:test";

import { githubConfig } from "../../../src/plugins/github/GitHubManifest";

test("githubConfig rejects a repository that is not owner/repo shaped", () => {
  expect(() =>
    githubConfig({ repository: "not-a-repo", query: "is:pr", max: 10 }),
  ).toThrow("Invalid github config");
});

test("githubConfig accepts a well-formed repository, query, and bound", () => {
  const config = githubConfig({
    repository: "acme/widget",
    query: "is:pr is:open",
    max: 50,
  });
  expect(config).toEqual({
    repository: "acme/widget",
    query: "is:pr is:open",
    max: 50,
  });
});
