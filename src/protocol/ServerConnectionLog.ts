import { NodeStore } from "../vfs/NodeStore";
import { log } from "../Logging";
import { Journal } from "./Journal";

const connectionLog = log.getSubLogger({ name: "server.connection" });

export function logAbort(error: unknown) {
  connectionLog.error(
    { error: errorMessage(error) },
    "Unhandled command error",
  );
}

export async function compact(journal: Journal, store: NodeStore) {
  try {
    await journal.compact(store);
  } catch (error) {
    connectionLog.error(
      { error: errorMessage(error) },
      "Journal compaction failed",
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
