import { expect, test } from "bun:test";

import { githubSettings } from "../../../src/plugins/github/GitHubSettings";

test("github settings default to api.github.com and carry the token", () => {
  expect(githubSettings({ YAFS_GITHUB_TOKEN: "secret" })).toEqual({
    apiUrl: "https://api.github.com",
    webUrl: "https://github.com",
    token: "secret",
  });
});

test("a GH_HOST-style enterprise cloud host resolves to its api subdomain", () => {
  expect(githubSettings({ YAFS_GITHUB_HOST: "va.ghe.com" }).apiUrl).toBe(
    "https://api.va.ghe.com",
  );
});

// Regression coverage for a real live bug: citation links hardcoded
// github.com even against a real GHEC deployment. The web host is the
// bare configured host in every shape (github.com, a .ghe.com data
// residency subdomain, or a self-hosted enterprise server) -- only the
// API host varies (api.<host>, or <host>/api/v3).
test("the web host is the bare configured host, unlike the api host", () => {
  expect(githubSettings({ YAFS_GITHUB_HOST: "va.ghe.com" }).webUrl).toBe(
    "https://va.ghe.com",
  );
  expect(
    githubSettings({ YAFS_GITHUB_HOST: "github.example.com" }).webUrl,
  ).toBe("https://github.example.com");
});

test("a self-hosted enterprise host resolves to its api/v3 path", () => {
  expect(
    githubSettings({ YAFS_GITHUB_HOST: "github.example.com" }).apiUrl,
  ).toBe("https://github.example.com/api/v3");
});

test("an explicit api url overrides the host mapping, but the web host still follows YAFS_GITHUB_HOST", () => {
  const settings = githubSettings({
    YAFS_GITHUB_HOST: "va.ghe.com",
    YAFS_GITHUB_API_URL: "https://custom.example.com/api",
  });
  expect(settings.apiUrl).toBe("https://custom.example.com/api");
  expect(settings.webUrl).toBe("https://va.ghe.com");
});

test("an explicit web url overrides the host mapping", () => {
  const settings = githubSettings({
    YAFS_GITHUB_HOST: "va.ghe.com",
    YAFS_GITHUB_WEB_URL: "https://custom.example.com",
  });
  expect(settings.webUrl).toBe("https://custom.example.com");
});

test("a non-https api url is rejected", () => {
  expect(() =>
    githubSettings({ YAFS_GITHUB_API_URL: "http://insecure.example.com" }),
  ).toThrow("must use https");
});
