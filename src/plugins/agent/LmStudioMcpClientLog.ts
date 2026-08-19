import { log } from "../../Logging";
import { LmStudioTurn } from "./LmStudioMcpClient";

const agentLog = log.getSubLogger({ name: "agent.lmstudio" });

export function logRequest(url: string, model: string | undefined) {
  agentLog.info({ url, model }, "LM Studio request");
}

export function logResponse(url: string, turn: LmStudioTurn) {
  const calls = turn.output.filter((item) => item.type === "tool_call").length;
  agentLog.info(
    { url, items: turn.output.length, toolCalls: calls },
    "LM Studio response",
  );
}

export function loggedFailure(url: string, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  agentLog.error({ url, error: message }, "LM Studio request failed");
  throw error;
}
