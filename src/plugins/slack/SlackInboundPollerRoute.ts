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

export type Poll = {
  record: PreparedMountRecord;
  config: InboundConfig;
  client: SlackChannelClient;
};
export type Msgs = SlackMessage[];

export type RouteDeps = { mounts: MountManager; dispatchCtl: DispatchCtl };

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
  const { persona, replyTimeoutMs, channel } = poll.config;
  const base = { ...deps, persona, slackCtlPath, botUserId };
  return { ...base, replyTimeoutMs, channel, client: poll.client };
}
