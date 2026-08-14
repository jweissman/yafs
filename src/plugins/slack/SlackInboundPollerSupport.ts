import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import { RouteOptions, routeMessage } from "./SlackInboundRouting";
import { SlackMessage } from "./SlackApiClient";

export type InboundConfig = SlackConfig & { persona: string };

export async function routeAll(
  options: RouteOptions,
  chatId: string,
  messages: SlackMessage[],
) {
  for (const message of messages) {
    await routeMessage(options, chatId, message);
  }
}

export function inboundConfig(
  record: PreparedMountRecord,
): InboundConfig | undefined {
  if (record.provider !== "slack") {
    return undefined;
  }
  const config = record.config as SlackConfig;
  return config.persona ? (config as InboundConfig) : undefined;
}

export function channelChatId(mountId: string, channel: string): string {
  return `slack-${mountId}-${channel}`;
}

export function log(mountId: string, error: unknown) {
  console.error(`Slack inbound poll failed for mount ${mountId}:`, error);
}

export function logBaseline(mountId: string, fetchedCount: number) {
  console.log(
    `Slack poll: mount ${mountId} established baseline (${fetchedCount} ` +
      "message(s) in history, none routed retroactively)",
  );
}

export function logPoll(
  mountId: string,
  fetchedCount: number,
  freshCount: number,
) {
  console.log(
    `Slack poll: mount ${mountId} fetched ${fetchedCount}, ` +
      `routing ${freshCount}`,
  );
}
