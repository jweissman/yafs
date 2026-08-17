import { rm } from "node:fs/promises";

interface StatePaths {
  directory: string;
}

export async function resetDaemon(
  statePaths: StatePaths,
  stop: () => Promise<void>,
  confirmed: boolean,
  report: (value: string) => void,
) {
  assertConfirmed(statePaths, confirmed);
  await resetData(statePaths, stop);
  report("reset");
}

async function resetData(statePaths: StatePaths, stop: () => Promise<void>) {
  await stop();
  await rm(statePaths.directory, { recursive: true, force: true });
}

function assertConfirmed(statePaths: StatePaths, confirmed: boolean) {
  if (!confirmed) {
    throw new Error(
      `yafsd reset permanently deletes ${statePaths.directory} (journal, ` +
        "mounts, audit log, blobs) with no undo. Re-run with --yes to confirm.",
    );
  }
}
