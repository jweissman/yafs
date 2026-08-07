import { PreparedMountRecord } from "../../mounts/types";

export type ChatMessage = { role: string; content: string };

export function chatPath(personaName: string, chatId: string): string {
  return `${personaName}/chats/${chatId}/messages.ndjson`;
}

export function historyFrom(
  record: PreparedMountRecord,
  personaName: string,
  chatId: string,
): ChatMessage[] {
  const path = chatPath(personaName, chatId);
  const found = record.snapshot.entries.find(([entry]) => entry === path);
  return parseHistory(found?.[1]);
}

function parseHistory(content: string | undefined): ChatMessage[] {
  if (!content) {
    return [];
  }
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChatMessage);
}

export function historyEntry(
  personaName: string,
  chatId: string,
  history: ChatMessage[],
): [string, string] {
  const rendered = history.map((message) => JSON.stringify(message)).join("\n");
  return [chatPath(personaName, chatId), rendered];
}
