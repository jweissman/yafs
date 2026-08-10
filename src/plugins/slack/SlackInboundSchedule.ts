import { SlackMessage } from "./SlackApiClient";

export type Cursor = { lastTs?: string };

export function newMessages(
  botUserId: string,
  cursor: Cursor,
  messages: SlackMessage[],
): SlackMessage[] {
  return messages
    .filter((message) => message.user !== botUserId)
    .filter((message) => isAfter(message.ts, cursor.lastTs))
    .sort((a, b) => Number(a.ts) - Number(b.ts));
}

function isAfter(ts: string, lastTs: string | undefined): boolean {
  return lastTs === undefined || Number(ts) > Number(lastTs);
}

export function advanceCursor(cursor: Cursor, newOnes: SlackMessage[]): Cursor {
  return newOnes.length ? { lastTs: newOnes[newOnes.length - 1].ts } : cursor;
}
