import { MountManager } from "../../mounts/MountManager";
import { Wiring } from "../../mounts/Plugin";
import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import { withError } from "./SlackErrorRecord";
import { AttemptDeps } from "./SlackOutboxAttempt";
import { SlackOutboxStore } from "./SlackOutboxStore";

export type SlackPoster = {
  postMessage(channel: string, text: string): Promise<string>;
};
export type ClientFor = (config: SlackConfig) => SlackPoster;

export type CommitDeps = {
  wiring: Wiring;
  clientFor: ClientFor;
  outbox: SlackOutboxStore;
};

export function attemptDepsFor(deps: CommitDeps): AttemptDeps {
  return {
    outbox: deps.outbox,
    post: (mountId, message) => post(deps, mountId, message),
    commitRefresh: (mountId) => commitRefresh(deps, mountId),
    commitError: (mountId, message, error) =>
      commitError(deps, { mountId, message, error }),
  };
}

function mounts(deps: CommitDeps): MountManager {
  return deps.wiring.mounts;
}

function findMount(deps: CommitDeps, mountId: string) {
  return mounts(deps)
    .mounts()
    .find((item) => item.id === mountId);
}

async function post(deps: CommitDeps, mountId: string, message: string) {
  const config = record(deps, mountId).config as SlackConfig;
  await deps.clientFor(config).postMessage(config.channel, message);
}

function record(deps: CommitDeps, mountId: string): PreparedMountRecord {
  const found = findMount(deps, mountId);
  if (!found) {
    throw new Error(`No such mount: ${mountId}`);
  }
  return found;
}

function commitRefresh(deps: CommitDeps, mountId: string) {
  return deps.wiring.enqueue(() => applyRefresh(deps, mountId));
}

async function applyRefresh(deps: CommitDeps, mountId: string) {
  const found = findMount(deps, mountId);
  if (!found) {
    return;
  }
  await commit(deps, await mounts(deps).prepareActivation(found, "system"));
}

type Failure = { mountId: string; message: string; error: unknown };

function commitError(deps: CommitDeps, failure: Failure) {
  return deps.wiring.enqueue(() => applyError(deps, failure));
}

async function applyError(deps: CommitDeps, failure: Failure) {
  const found = findMount(deps, failure.mountId);
  if (found) {
    await commit(deps, withError(found, failure.message, failure.error));
  }
}

async function commit(deps: CommitDeps, updated: PreparedMountRecord) {
  await deps.wiring.journal.commit([
    { type: "refresh", record: updated, at: new Date().toISOString() },
  ]);
  mounts(deps).refresh(updated, "system");
}
