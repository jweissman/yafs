import { PreparedMountRecord } from "../../mounts/types";

export function threadPath(personaName: string, chatId: string): string {
  return `${personaName}/chats/${chatId}/lmstudio-response-id.txt`;
}

export function threadResponseId(
  record: PreparedMountRecord,
  personaName: string,
  chatId: string,
): string | undefined {
  const path = threadPath(personaName, chatId);
  return record.snapshot.entries.find(([entry]) => entry === path)?.[1];
}

export function threadEntry(
  personaName: string,
  chatId: string,
  responseId: string,
): [string, string] {
  return [threadPath(personaName, chatId), responseId];
}
