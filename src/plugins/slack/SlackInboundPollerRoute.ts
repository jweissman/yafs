import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { PreparedMountRecord } from "../../mounts/types";
import { DispatchCtl } from "./SlackInboundRouting";
import {
  channelChatId,
  InboundConfig,
  routeAll,
} from "./SlackInboundPollerSupport";
import { SlackChannelClient, SlackMessage } from "./SlackApiClient";

export interface Poll {
  record: PreparedMountRecord;
  config: InboundConfig;
  client: SlackChannelClient;
}
export type Msgs = SlackMessage[];

export interface RouteDeps {
  mounts: MountManager;
  dispatchCtl: DispatchCtl;
}

export async function route(
  deps: RouteDeps,
  poll: Poll,
  botUserId: string,
  messages: SlackMessage[],
) {
  const options = routeOptions(deps, poll, botUserId);
  const chatId = channelChatId(poll.record.id, poll.config.channel);
  await routeAll(options, chatId, messages);
}

function routeOptions(deps: RouteDeps, poll: Poll, botUserId: string) {
  const slackCtlPath = `${poll.record.path}/ctl` as AbsolutePath;
  const base = { ...deps, slackCtlPath, botUserId, client: poll.client };
  return { ...base, ...configFields(poll.config) };
}

function configFields(config: InboundConfig) {
  const { persona, replyTimeoutMs, channel, reactions } = config;
  return {
    persona,
    replyTimeoutMs,
    channel,
    reactionsEnabled: reactions ?? true,
  };
}
