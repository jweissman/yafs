import { ModelClient } from "../src/plugins/agent/ChatCompletionClient";
import { sleep } from "./agent_test_helpers";

export function fakeExchangeModel(
  reply: string,
  calls: { system: string; message: string }[],
): ModelClient {
  return { completeChat: async (chat) => recordExchange(reply, calls, chat) };
}

async function recordExchange(
  reply: string,
  calls: { system: string; message: string }[],
  chat: { role: string; content: string }[],
) {
  calls.push(exchange(chat));
  return reply;
}

function exchange(chat: { role: string; content: string }[]) {
  return { system: chat[0].content, message: chat[chat.length - 1].content };
}

export function fakeMessageModel(collected: string[]): ModelClient {
  return {
    completeChat: async (chat) => {
      const message = chat[chat.length - 1].content;
      collected.push(message);
      return `reply-to-${message}`;
    },
  };
}

export function failingModel(message: string): ModelClient {
  return {
    completeChat: async () => {
      throw new Error(message);
    },
  };
}

export function slowModel(reply: string, delayMs: number): ModelClient {
  return {
    completeChat: async () => {
      await sleep(delayMs);
      return reply;
    },
  };
}

export function chunkedModel(chunks: string[], delayMs: number): ModelClient {
  const completeChat = (_chat: unknown, onDelta?: (delta: string) => void) =>
    deliver(chunks, delayMs, onDelta);
  return { completeChat };
}

async function deliver(
  chunks: string[],
  delayMs: number,
  onDelta?: (delta: string) => void,
) {
  for (const chunk of chunks) {
    await deliverChunk(chunk, delayMs, onDelta);
  }
  return chunks.join("");
}

async function deliverChunk(
  chunk: string,
  delayMs: number,
  onDelta?: (delta: string) => void,
) {
  await sleep(delayMs);
  onDelta?.(chunk);
}

export function recordingModel(
  replies: string[],
  calls: { role: string; content: string }[][],
): ModelClient {
  const state = { index: 0 };
  const completeChat = (chat: { role: string; content: string }[]) =>
    recordAndReply(replies, calls, state, chat);
  return { completeChat };
}

async function recordAndReply(
  replies: string[],
  calls: { role: string; content: string }[][],
  state: { index: number },
  chat: { role: string; content: string }[],
) {
  calls.push(chat);
  return replies[state.index++];
}
