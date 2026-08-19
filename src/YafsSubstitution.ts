import { AbsolutePath } from "./core/AbsolutePath";
import { Command } from "./types/Command";
import { assertReadOnlyCommand } from "./commands/ReadOnlySource";

export interface RuntimeSnapshot {
  cwd: AbsolutePath;
  operationState: { operations: number; effects: number };
}

export interface SubstitutionHost {
  handle(command: Command): string;
  handleAsync(command: Command): Promise<string>;
  snapshot(): RuntimeSnapshot;
  restore(state: RuntimeSnapshot): void;
}

export function substitute(host: SubstitutionHost, command: Command): string {
  assertReadOnlyCommand(command);
  const state = host.snapshot();
  try {
    return trimmed(host.handle(command));
  } finally {
    host.restore(state);
  }
}

export function substituteAsync(
  host: SubstitutionHost,
  command: Command,
): Promise<string> {
  assertReadOnlyCommand(command);
  const state = host.snapshot();
  return restoring(host, state, host.handleAsync(command).then(trimmed));
}

function restoring<T>(
  host: SubstitutionHost,
  state: RuntimeSnapshot,
  result: Promise<T>,
): Promise<T> {
  return result.finally(() => {
    host.restore(state);
  });
}

function trimmed(output: string): string {
  return output.replace(/\n+$/, "");
}
