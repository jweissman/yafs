import { expect, test } from "bun:test";

import { scopedStartHere } from "../../src/mcp/ScopedStartHere";
import { StartHereValue } from "../../src/operations/WorkspaceOperation";

test("maps a configured root to the mount it falls under, preferring the longest match", () => {
  const value = baseValue();
  value.mounts.unshift({
    path: "/home/root/world/github",
    provider: "github",
    revision: "1",
    capabilities: [],
  });
  const result = scopedStartHere(value, [
    "/home/root/world/github/acme/widget",
  ]);
  expect(result.scoped).toBe(true);
  expect(result.rootMounts).toEqual([
    {
      root: "/home/root/world/github/acme/widget",
      mount: "/home/root/world/github/acme/widget",
      provider: "github",
    },
  ]);
  expect(result.recommendedFirst).toEqual([
    "yafs.tree on /home/root/world/github/acme/widget (your configured root)",
    "yafs.read on a specific file once you've found it via tree/find",
  ]);
});

test("omits a root that falls under no known mount", () => {
  const value = baseValue();
  const result = scopedStartHere(value, ["/home/root/unmounted"]);
  expect(result.rootMounts).toEqual([]);
});

test("does not leak mounts outside the scoped session's own roots", () => {
  const value = baseValue();
  value.mounts.push({
    path: "/home/root/world/slack/channels/updates",
    provider: "slack",
    revision: "1",
    capabilities: [],
  });
  const result = scopedStartHere(value, [
    "/home/root/world/github/acme/widget",
  ]);
  expect(result.mounts).toEqual([
    {
      path: "/home/root/world/github/acme/widget",
      provider: "github",
      revision: "1",
      capabilities: [],
    },
  ]);
});

function baseValue(): StartHereValue {
  return {
    kind: "startHere",
    principal: "root",
    cwd: "/home/root",
    scoped: false,
    recommendedFirst: [],
    mounts: [
      {
        path: "/home/root/world/github/acme/widget",
        provider: "github",
        revision: "1",
        capabilities: [],
      },
    ],
  };
}
