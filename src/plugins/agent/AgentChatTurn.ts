import { AgentRequest, userTurn } from "./AgentRequest";
import { AgentChatStore } from "./AgentChatStore";
import { RunContext } from "./AgentTarget";
import { ChatMessage } from "./AgentChatHistory";

export function acceptChatTurn(
  chats: AgentChatStore,
  context: RunContext,
  request: AgentRequest,
) {
  return request.chatId
    ? chats.appendChatTurnNow(context, request.chatId, userTurn(request))
    : Promise.resolve();
}

export function chatHistoryFor(
  chats: AgentChatStore,
  context: RunContext,
  request: AgentRequest,
): ChatMessage[] | undefined {
  return request.chatId
    ? chats.currentHistory(context, request.chatId)
    : undefined;
}

export function finishChatTurn(
  chats: AgentChatStore,
  context: RunContext,
  chatId: string | undefined,
  reply: string,
) {
  const message: ChatMessage = { role: "assistant", content: reply };
  return chatId
    ? chats.appendChatTurn(context, chatId, message)
    : Promise.resolve();
}
