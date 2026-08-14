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
    systemPrompt: systemPromptFor(call),
    integrations: [integrationFor(call)],
    previousResponseId: previousResponseIdFor(deps.chats, call),
  };
}

// Without this, the model has tools but no idea what path to point them
// at, or that yafs.start_here exists to discover that path itself —
// `tools.roots` scopes the jail, but nothing else tells the model that
// scope exists. Live-observed failure this fixes: asked to triage a PR
// queue it had real read/list access to, the model replied "I haven't
// pulled the list of open PRs yet... give me the PR URLs" — technically
// honest (better than confabulating), but avoidable, since yafs already
// knows exactly where to point it. Names start_here/tree/find explicitly
// rather than leaving "you have tools" implicit, so a model that still
// fails to call them is a measurable prompt/catalog gap, not a mystery.
export function systemPromptFor(call: ToolCall): string {
  const roots = call.target.persona.tools?.roots ?? [];
  return roots.length
    ? `${call.target.persona.prompt}\n\n${rootsHint(roots)}`
    : call.target.persona.prompt;
}

function rootsHint(roots: string[]): string {
  return (
    "You can inspect the configured Yafs world through MCP. Your tools " +
    `are scoped to: ${roots.join(", ")}. Begin with yafs.start_here; ` +
    "then use yafs.tree or yafs.find on an accessible source. Do not " +
    "ask the user for information you can look up yourself until those " +
    "calls show no relevant source."
  );
}

function integrationFor(call: ToolCall) {
  const { mountId, personaName } = call.context;
  return {
    type: "plugin" as const,
    id: `mcp/${yafsKey(mountId, personaName)}`,
  };
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
