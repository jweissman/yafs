import { AgentChatStore } from "./AgentChatStore";
import { PersonaConfig, AgentConfig } from "../../mounts/types";
import { deltaWriter } from "./AgentDeltaWriter";
import { AgentRequest, completeAgent } from "./AgentRequest";
import { AgentTarget, RunContext } from "./AgentTarget";
import { AgentRunStore } from "./AgentRunStore";
import { chatHistoryFor } from "./AgentChatTurn";
import { ModelClient } from "./ChatCompletionClient";

export type ModelFor = (
  persona: PersonaConfig,
  mount: AgentConfig,
) => ModelClient;

export interface AgentTextDependencies {
  modelFor: ModelFor;
  runs: AgentRunStore;
  chats: AgentChatStore;
}

export function textCompletion(
  deps: AgentTextDependencies,
  target: AgentTarget,
  context: RunContext,
  request: AgentRequest,
) {
  const model = deps.modelFor(target.persona, target.config);
  const options = completionOptions(deps, context, request);
  return completeAgent(model, target.persona, request, options);
}

function completionOptions(
  deps: AgentTextDependencies,
  context: RunContext,
  request: AgentRequest,
) {
  return {
    onDelta: deltaWriter(deps.runs, context),
    history: chatHistoryFor(deps.chats, context, request),
  };
}
