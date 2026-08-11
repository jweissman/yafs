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
    .filter((message) => mentions(botUserId, message.text))
    .sort((a, b) => Number(a.ts) - Number(b.ts));
}

function isAfter(ts: string, lastTs: string | undefined): boolean {
  return lastTs === undefined || Number(ts) > Number(lastTs);
}

// A fresh (post-restart) or newly-configured cursor has no lastTs, so
// isAfter alone would treat the entire fetched history window as new.
// Requiring an explicit @mention keeps that window's blast radius to
// "someone addressed the bot," not "anything anyone said recently."
export function mentions(botUserId: string, text: string): boolean {
  return text.includes(mentionToken(botUserId));
}

export function mentionToken(botUserId: string): string {
  return `<@${botUserId}>`;
}

export function stripMention(botUserId: string, text: string): string {
  return text.split(mentionToken(botUserId)).join("").trim();
}

export function advanceCursor(cursor: Cursor, newOnes: SlackMessage[]): Cursor {
  return newOnes.length ? { lastTs: newOnes[newOnes.length - 1].ts } : cursor;
}
