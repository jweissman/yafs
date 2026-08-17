import { MountManager } from "../../mounts/MountManager";
import { AgentTarget, RunContext } from "./AgentTarget";
import { AgentRequest, userTurn } from "./AgentRequest";
import { AgentChatStore } from "./AgentChatStore";
import { AgentRunStore } from "./AgentRunStore";
import { finalMessage, LmStudioTurn, ToolClientFor } from "./LmStudioMcpClient";
import { yafsKey } from "./LmStudioMcpJson";
import { citationsFooter } from "./AgentToolCitations";

export type ToolServerUrl = (mountId: string, personaName: string) => string;
export interface ToolDeps {
  chats: AgentChatStore;
  runs: AgentRunStore;
  toolClientFor: ToolClientFor;
  mounts: MountManager;
}
export interface ToolCall {
  target: AgentTarget;
  context: RunContext;
  request: AgentRequest;
}

export async function completeWithTools(
  deps: ToolDeps,
  call: ToolCall,
): Promise<string> {
  const startedAt = Date.now();
  const turn = await toolResponse(deps, call);
  const elapsedMs = elapsed(startedAt);
  await recordTurn(deps, call, turn);
  return reply(deps.mounts, turn, elapsedMs);
}

async function toolResponse(deps: ToolDeps, call: ToolCall) {
  const client = deps.toolClientFor(call.target.persona, call.target.config);
  return client.respond(turnRequest(deps, call));
}

function elapsed(startedAt: number): number {
  return Date.now() - startedAt;
}

function reply(mounts: MountManager, turn: LmStudioTurn, elapsedMs: number) {
  return finalMessage(turn) + citationsFooter(mounts, turn, elapsedMs);
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
  return rootInstructions(roots).join(" ");
}

function rootInstructions(roots: string[]): string[] {
  return [
    `Your MCP tools are scoped to: ${roots.join(", ")}.`,
    "Begin with yafs.start_here, then use yafs.tree or yafs.find.",
    "Look up available context before asking the user for it.",
    "Use resourceShape links when citing a discovered provider resource.",
    "Scan cheap, small items broadly before reading large items in full.",
  ];
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
