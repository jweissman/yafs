import { OutboxId } from "./SlackOutboxEntries";
import { SlackOutboxStore } from "./SlackOutboxStore";
import {
  failedStatus,
  runningStatus,
  succeededStatus,
} from "./SlackOutboxStatus";

export interface AttemptDeps {
  outbox: SlackOutboxStore;
  post: (mountId: string, message: string) => Promise<void>;
  commitRefresh: (mountId: string) => Promise<void>;
  commitError: (
    mountId: string,
    message: string,
    error: unknown,
  ) => Promise<void>;
}

export interface Attempt {
  id: OutboxId;
  message: string;
  startedAt: string;
}

export async function attemptDelivery(deps: AttemptDeps, attempt: Attempt) {
  const { id, message, startedAt } = attempt;
  await deps.outbox.writeStatus(id, runningStatus(startedAt));
  try {
    await deps.post(id.mountId, message);
    await onDelivered(deps, id, startedAt);
  } catch (error) {
    await onFailed(deps, { id, message, startedAt, error });
  }
}

async function onDelivered(deps: AttemptDeps, id: OutboxId, startedAt: string) {
  await deps.outbox.writeStatus(id, succeededStatus(startedAt));
  await deps.commitRefresh(id.mountId);
}

type Failure = Attempt & { error: unknown };

async function onFailed(deps: AttemptDeps, failure: Failure) {
  const { id, message, startedAt, error } = failure;
  await deps.outbox.writeStatus(id, failedStatus(startedAt, error));
  await deps.commitError(id.mountId, message, error);
}
