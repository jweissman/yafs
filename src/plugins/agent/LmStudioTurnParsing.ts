import { LmStudioOutputItem, LmStudioTurn } from "./LmStudioMcpClient";

export function parseTurn(json: unknown): LmStudioTurn {
  const value = json as { output?: unknown; response_id?: unknown };
  const output = Array.isArray(value.output)
    ? (value.output as LmStudioOutputItem[])
    : [];
  return { output, responseId: responseIdOf(value.response_id) };
}

function responseIdOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
