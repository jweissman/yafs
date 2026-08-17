import { MountManager } from "../../mounts/MountManager";
import { AgentChatStore } from "./AgentChatStore";
import { AgentRequest } from "./AgentRequest";
import { AgentRunCancellation } from "./AgentRunCancellation";
import { AgentRunStore } from "./AgentRunStore";
import { finishChatTurn } from "./AgentChatTurn";
import { RunContext } from "./AgentTarget";

export interface AgentRunFinisherDependencies {
  runs: AgentRunStore;
  chats: AgentChatStore;
  cancels: AgentRunCancellation;
  mounts: MountManager;
}

export async function finishAgentRun(
  deps: AgentRunFinisherDependencies,
  context: RunContext,
  request: AgentRequest,
  reply: string,
) {
  return cancelled(deps, context)
    ? undefined
    : persistCompletion(deps, context, request, reply);
}

function cancelled(deps: AgentRunFinisherDependencies, context: RunContext) {
  return deps.cancels.cancelledRun(context.mountId, context.runId);
}

async function persistCompletion(
  deps: AgentRunFinisherDependencies,
  context: RunContext,
  request: AgentRequest,
  reply: string,
) {
  await finishChatTurn(deps.chats, context, request.chatId, reply);
  return deps.runs.finish({ ...context, message: request.message, reply });
}
