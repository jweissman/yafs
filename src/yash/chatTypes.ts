import type { ExecutionResult } from "../types/ExecutionResult";

export interface ChatClient {
  execute(command: string): Promise<ExecutionResult>;
  writeFile(path: string, content: string): Promise<ExecutionResult>;
}

export interface PersonaListing {
  mountPath: string;
  persona: string;
}
