import { PreparedMountRecord, SlackConfig } from "../../mounts/types";
import { log as appLog } from "../../Logging";
import { RouteOptions, routeMessage } from "./SlackInboundRouting";
import { SlackMessage } from "./SlackApiClient";

export type InboundConfig = SlackConfig & { persona: string };

const slackLog = appLog.getSubLogger({ name: "slack.inbound" });

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

export function logPollFailure(mountId: string, error: unknown) {
  slackLog.error(
    { mountId, error: errorMessage(error) },
    "Slack inbound poll failed",
  );
}

export function logBaseline(mountId: string, fetchedCount: number) {
  slackLog.info(
    { mountId, fetchedCount },
    "Slack poll established baseline, none routed retroactively",
  );
}

export function logPoll(
  mountId: string,
  fetchedCount: number,
  freshCount: number,
) {
  slackLog.info({ mountId, fetchedCount, freshCount }, "Slack poll");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
