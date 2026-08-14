import { LmStudioOutputItem, LmStudioTurn } from "./LmStudioMcpClient";

export function finalMessage(turn: LmStudioTurn): string {
  return turn.output
    .filter(isMessage)
    .map((item) => item.content)
    .join("\n\n");
}

function isMessage(
  item: LmStudioOutputItem,
): item is { type: "message"; content: string } {
  return item.type === "message";
}
