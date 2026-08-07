export function agentError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
