import { LmStudioTurn } from "./LmStudioMcpClient";

export function logRequest(url: string, model: string | undefined) {
  console.log(`agent LM Studio request: ${model ?? "(no model)"} -> ${url}`);
}

export function logResponse(url: string, turn: LmStudioTurn) {
  const calls = turn.output.filter((item) => item.type === "tool_call").length;
  console.log(
    `agent LM Studio response: ${url} -> ${turn.output.length} item(s), ` +
      `${calls} tool call(s)`,
  );
}

export function loggedFailure(url: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`agent LM Studio request failed: ${url}: ${message}`);
  throw error;
}
