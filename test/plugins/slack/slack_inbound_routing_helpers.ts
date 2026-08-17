import { AbsolutePath } from "../../../src/core/AbsolutePath";
import { MountManager } from "../../../src/mounts/MountManager";
import { PreparedMountRecord } from "../../../src/mounts/types";
import { DispatchCtl } from "../../../src/plugins/slack/SlackInboundRouting";

export function fakeMounts(entries: [string, string][]): MountManager {
  const record = {
    id: "agents",
    path: "/home/root/agents",
    provider: "agent",
    config: { personas: { reviewer: { prompt: "You are a reviewer" } } },
    snapshot: { entries },
  } as unknown as PreparedMountRecord;
  return { mounts: () => [record] } as unknown as MountManager;
}

interface DispatchFixture {
  personaCtlPath: AbsolutePath;
  slackCtlPath: AbsolutePath;
  entries: [string, string][];
  postSucceeds: boolean;
}

export function fakeDispatch(
  personaCtlPath: AbsolutePath,
  slackCtlPath: AbsolutePath,
  entries: [string, string][],
  postSucceeds = false,
): DispatchCtl {
  const fixture = { personaCtlPath, slackCtlPath, entries, postSucceeds };
  return (path, payload) => handle(fixture, path, payload);
}

async function handle(fixture: DispatchFixture, path: string, payload: string) {
  if (path === fixture.personaCtlPath) {
    seedCompletedRun(fixture.entries, payload);
  } else if (path === fixture.slackCtlPath && !fixture.postSucceeds) {
    throw new Error("post_failed");
  }
  return true;
}

function seedCompletedRun(entries: [string, string][], payload: string) {
  const { runId } = JSON.parse(payload) as { runId: string };
  entries.push([
    `reviewer/runs/${runId}/status.json`,
    JSON.stringify({ state: "complete" }),
  ]);
  entries.push([`reviewer/runs/${runId}/response.md`, "the reply"]);
}

export async function waitFor(matches: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (matches()) {
      return;
    }
    await sleep(20);
  }
  throw new Error("Timed out waiting for the condition");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
