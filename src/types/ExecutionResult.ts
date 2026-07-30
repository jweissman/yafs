import { AbsolutePath } from '../core/AbsolutePath';


export type ExecutionResult = {
  stdout: string;
  stderr: string;
  status: number;
  error?: { code: string; message: string; };
  session: { user: string; cwd: AbsolutePath; };
};
