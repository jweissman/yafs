import { expect, test } from "bun:test";

import { githubConfig } from "../../../src/plugins/github/GitHubManifest";

test("githubConfig rejects a repository that is not owner/repo shaped", () => {
  expect(() =>
    githubConfig({
      repository: "not-a-repo",
      pulls: { query: "is:pr", max: 10 },
    }),
  ).toThrow("Invalid github config");
});

test("githubConfig accepts a repository with no pulls or commits requested", () => {
  const config = githubConfig({ repository: "acme/widget" });
  expect(config).toEqual({ repository: "acme/widget" });
});

test("githubConfig accepts a well-formed pulls query and bound", () => {
  const config = githubConfig({
    repository: "acme/widget",
    pulls: { query: "is:pr is:open", max: 50 },
  });
  expect(config).toEqual({
    repository: "acme/widget",
    pulls: { query: "is:pr is:open", max: 50 },
  });
});

test("githubConfig rejects the old flat query/max shape as unknown fields", () => {
  expect(() =>
    githubConfig({ repository: "acme/widget", query: "is:pr", max: 10 }),
  ).toThrow("Unknown github config field: query");
});

test("githubConfig rejects a malformed pulls block", () => {
  const base = { repository: "acme/widget" };
  expect(() => githubConfig({ ...base, pulls: { max: 10 } })).toThrow(
    "Invalid github config",
  );
  expect(() =>
    githubConfig({ ...base, pulls: { query: "is:pr", max: 0 } }),
  ).toThrow("Invalid github config");
  expect(() =>
    githubConfig({ ...base, pulls: { query: "is:pr", max: 10, extra: true } }),
  ).toThrow("Invalid github config");
  expect(() => githubConfig({ ...base, pulls: "is:pr" })).toThrow(
    "Invalid github config",
  );
});

test("githubConfig accepts an independent commits.max, separate from pulls' own max", () => {
  const config = githubConfig({
    repository: "acme/widget",
    pulls: { query: "is:pr is:open", max: 50 },
    commits: { max: 20 },
  });
  expect(config).toEqual({
    repository: "acme/widget",
    pulls: { query: "is:pr is:open", max: 50 },
    commits: { max: 20 },
  });
});

test("githubConfig accepts commits with no pulls requested at all", () => {
  const config = githubConfig({
    repository: "acme/widget",
    commits: { max: 20 },
  });
  expect(config).toEqual({
    repository: "acme/widget",
    commits: { max: 20 },
  });
});

test("githubConfig rejects an out-of-range or malformed commits.max", () => {
  const base = { repository: "acme/widget" };
  expect(() => githubConfig({ ...base, commits: { max: 0 } })).toThrow(
    "Invalid github config",
  );
  expect(() => githubConfig({ ...base, commits: { max: 101 } })).toThrow(
    "Invalid github config",
  );
  expect(() => githubConfig({ ...base, commits: { max: 1.5 } })).toThrow(
    "Invalid github config",
  );
  expect(() => githubConfig({ ...base, commits: "12" })).toThrow(
    "Invalid github config",
  );
  expect(() => githubConfig({ ...base, commits: {} })).toThrow(
    "Invalid github config",
  );
  expect(() =>
    githubConfig({ ...base, commits: { max: 20, extra: true } }),
  ).toThrow("Invalid github config");
});
