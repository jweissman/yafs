import { expect, test } from "bun:test";

import { AbsolutePath } from "../../../src/core/AbsolutePath";
import { MountManager } from "../../../src/mounts/MountManager";
import { PreparedMountRecord } from "../../../src/mounts/types";
import {
  awaitReply,
  RunLookup,
} from "../../../src/plugins/slack/SlackReplyWait";

// A pending reply-wait is a detached background watcher (SlackInboundRouting's
// `void reply(...)`), not something daemon shutdown should block on. If its
// poll timer isn't unref'd, `yafsd stop` can report success (its state file
// check passes) while the OS process is still alive running out this timer —
// see SlackReplyWait.ts's `sleep()` for the fix this guards.
test("awaitReply's poll timer does not keep the process alive", async () => {
  const capturedTimers: NodeJS.Timeout[] = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = ((fn: () => void, ms?: number) => {
    const timer = originalSetTimeout(fn, ms);
    capturedTimers.push(timer);
    return timer;
  }) as typeof setTimeout;

  try {
    await awaitReply(fakeLookup(), 50);
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  expect(capturedTimers.length).toBeGreaterThan(0);
  expect(capturedTimers.every((timer) => !timer.hasRef())).toBe(true);
});

function fakeLookup(): RunLookup {
  const record = {
    id: "agents",
    snapshot: { entries: [] },
  } as unknown as PreparedMountRecord;
  const mounts = { mounts: () => [record] } as unknown as MountManager;
  const target = {
    personaPath: "/home/root/agents/reviewer" as AbsolutePath,
    mountId: "agents",
    personaName: "reviewer",
  };
  return { mounts, target, runId: "run-1" };
}
