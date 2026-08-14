import { AbsolutePath } from "./core/AbsolutePath";
import { errorCode } from "./core/errors";
import { ExecutionResult } from "./types/ExecutionResult";
import Yafs from "./index";

export function success(
  yafs: Yafs,
  stdout: string,
  value?: ExecutionResult["value"],
): ExecutionResult {
  return { stdout, stderr: "", status: 0, value, session: session(yafs) };
}

export function failure(yafs: Yafs, error: unknown): ExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    stdout: "",
    stderr: message,
    status: message.startsWith("Unknown command:") ? 127 : 1,
    error: { code: errorCode(message), message },
    session: session(yafs),
  };
}

function session(yafs: Yafs) {
  return { user: yafs.user.name, cwd: yafs.shell.pwd as AbsolutePath };
}
