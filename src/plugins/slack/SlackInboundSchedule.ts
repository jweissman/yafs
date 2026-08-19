import { SlackMessage } from "./SlackApiClient";

export interface Cursor {
  lastTs?: string;
}

export function newMessages(
  botUserId: string,
  cursor: Cursor,
  messages: SlackMessage[],
  requireMention = true,
): SlackMessage[] {
  const candidates = freshMessages(botUserId, cursor, messages);
  return addressed(candidates, botUserId, requireMention).sort(bySeq);
}

function freshMessages(
  botUserId: string,
  cursor: Cursor,
  messages: SlackMessage[],
) {
  return messages
    .filter((message) => message.user !== botUserId)
    .filter((message) => isAfter(message.ts, cursor.lastTs));
}

function addressed(
  messages: SlackMessage[],
  botUserId: string,
  requireMention: boolean,
) {
  return requireMention
    ? messages.filter((m) => mentions(botUserId, m.text))
    : messages;
}

function bySeq(a: SlackMessage, b: SlackMessage) {
  return Number(a.ts) - Number(b.ts);
}

function isAfter(ts: string, lastTs: string | undefined): boolean {
  return lastTs === undefined || Number(ts) > Number(lastTs);
}

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

export function baselineCursor(messages: SlackMessage[]): Cursor {
  if (!messages.length) {
    return {};
  }
  const latest = messages.reduce(latestOf, messages[0].ts);
  return { lastTs: latest };
}

function latestOf(latest: string, message: SlackMessage): string {
  return Number(message.ts) > Number(latest) ? message.ts : latest;
}
