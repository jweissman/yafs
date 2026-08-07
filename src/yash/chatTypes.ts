import type { ExecutionResult } from "../types/ExecutionResult";

export type ChatClient = {
  execute(command: string): Promise<ExecutionResult>;
  writeFile(path: string, content: string): Promise<ExecutionResult>;
};

export type PersonaListing = { mountPath: string; persona: string };
