import { PersonaConfig } from "../../mounts/types";
import { ModelClient } from "./ChatCompletionClient";
import { ChatMessage } from "./AgentChatHistory";

export type AgentRequest = {
  message: string;
  context?: string;
  runId?: string;
  chatId?: string;
};

type RawRequest = {
  message?: unknown;
  context?: unknown;
  runId?: unknown;
  chatId?: unknown;
};

export function parseAgentRequest(payload: string): AgentRequest {
  const value = JSON.parse(payload) as RawRequest;
  assertMessage(value.message, payload);
  assertOptionalStrings(value, payload);
  return value as AgentRequest;
}

function assertOptionalStrings(value: RawRequest, payload: string) {
  [value.context, value.runId, value.chatId].forEach((v) =>
    assertOptionalString(v, payload),
  );
}

function assertMessage(
  message: unknown,
  payload: string,
): asserts message is string {
  if (typeof message !== "string") {
    throw new Error(`Invalid agent action: ${payload}`);
  }
}

function assertOptionalString(value: unknown, payload: string) {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Invalid agent action: ${payload}`);
  }
}

export type CompletionExtras = {
  onDelta?: (delta: string) => void;
  history?: ChatMessage[];
};

export function completeAgent(
  model: ModelClient,
  persona: PersonaConfig,
  request: AgentRequest,
  extras: CompletionExtras = {},
) {
  const { onDelta, history } = extras;
  return model.completeChat(messagesFor(persona, request, history), onDelta);
}

function messagesFor(
  persona: PersonaConfig,
  request: AgentRequest,
  history?: ChatMessage[],
) {
  const system = { role: "system", content: persona.prompt };
  return history ? [system, ...history] : [system, userTurn(request)];
}

export function userTurn(request: AgentRequest): ChatMessage {
  return { role: "user", content: modelMessage(request) };
}

function modelMessage(request: AgentRequest) {
  return request.context
    ? `${request.message}\n\nContext:\n${request.context}`
    : request.message;
}
