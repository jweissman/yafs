import { AbsolutePath } from "../core/AbsolutePath";
import { WorkspaceValue } from "../operations/WorkspaceOperation";

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  status: number;
  error?: { code: string; message: string };
  value?: WorkspaceValue;
  session: { user: string; cwd: AbsolutePath };
}
