import { MountManager } from "../../mounts/MountManager";
import { LmStudioOutputItem, LmStudioTurn } from "./LmStudioMcpClient";
import { uniqueCitations } from "./AgentCitationLookup";

export function citationsFooter(
  mounts: MountManager,
  turn: LmStudioTurn,
  elapsedMs: number,
): string {
  const calls = turn.output.filter(isToolCall).length;
  return footer(calls, elapsedMs, uniqueCitations(mounts, turn));
}

function footer(calls: number, elapsedMs: number, citations: string[]): string {
  return `\n\n---\n${summary(calls, elapsedMs)}${viewedSuffix(citations)}`;
}

function summary(calls: number, elapsedMs: number): string {
  return calls
    ? `${String(calls)} tool call(s) this turn, in ${duration(elapsedMs)}`
    : `0 tool calls this turn (${duration(elapsedMs)}) -- nothing above was freshly verified`;
}

function duration(elapsedMs: number): string {
  const seconds = Math.round(elapsedMs / 1000);
  return seconds < 60
    ? `${String(seconds)}s`
    : `${String(Math.floor(seconds / 60))}m${String(seconds % 60).padStart(2, "0")}s`;
}

function viewedSuffix(citations: string[]): string {
  return citations.length
    ? `. Viewed:\n${citations.map((line) => `- ${line}`).join("\n")}`
    : ".";
}

export function isToolCall(
  item: LmStudioOutputItem,
): item is Extract<LmStudioOutputItem, { type: "tool_call" }> {
  return item.type === "tool_call";
}
