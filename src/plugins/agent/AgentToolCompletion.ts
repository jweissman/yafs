import { AgentTarget, RunContext } from "./AgentTarget";
import { AgentRequest, userTurn } from "./AgentRequest";
import { AgentChatStore } from "./AgentChatStore";
import { AgentRunStore } from "./AgentRunStore";
import { finalMessage, LmStudioTurn, ToolClientFor } from "./LmStudioMcpClient";
import { yafsKey } from "./LmStudioMcpJson";

export type ToolServerUrl = (mountId: string, personaName: string) => string;
export type ToolDeps = {
  chats: AgentChatStore;
  runs: AgentRunStore;
  toolClientFor: ToolClientFor;
};
export type ToolCall = {
  target: AgentTarget;
  context: RunContext;
  request: AgentRequest;
};

export async function completeWithTools(
  deps: ToolDeps,
  call: ToolCall,
): Promise<string> {
  const { persona, config } = call.target;
  const client = deps.toolClientFor(persona, config);
  const turn = await client.respond(turnRequest(deps, call));
  await recordTurn(deps, call, turn);
  return finalMessage(turn);
}

function turnRequest(deps: ToolDeps, call: ToolCall) {
  return {
    input: userTurn(call.request).content,
    systemPrompt: call.target.persona.prompt,
    integrations: [integrationFor(call)],
    previousResponseId: previousResponseIdFor(deps.chats, call),
  };
}

function integrationFor(call: ToolCall) {
  const { mountId, personaName } = call.context;
  return { type: "plugin" as const, id: `mcp/${yafsKey(mountId, personaName)}` };
}

function previousResponseIdFor(chats: AgentChatStore, call: ToolCall) {
  if (!call.request.chatId) {
    return undefined;
  }
  return chats.currentResponseId(call.context, call.request.chatId);
}

function recordTurn(deps: ToolDeps, call: ToolCall, turn: LmStudioTurn) {
  const responseId = responseIdUpdate(deps, call, turn);
  const transcript = deps.runs.writeTranscript(call.context, turn.output);
  return Promise.all([transcript, responseId]);
}

function responseIdUpdate(deps: ToolDeps, call: ToolCall, turn: LmStudioTurn) {
  const { chatId } = call.request;
  return chatId && turn.responseId
    ? deps.chats.recordResponseId(call.context, chatId, turn.responseId)
    : Promise.resolve();
}
