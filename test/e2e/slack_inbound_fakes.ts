import { SlackMessage } from "../../src/plugins/slack/SlackApiClient";

export interface Reaction {
  action: "add" | "remove";
  channel: string;
  ts: string;
}
export interface FakeState {
  messages: SlackMessage[];
  posted: { channel: string; text: string }[];
  reactions: Reaction[];
  failNextHistory?: boolean;
}

export function fakeState(messages: SlackMessage[]): FakeState {
  return { messages, posted: [], reactions: [] };
}

export function arrive(state: FakeState, message: SlackMessage) {
  state.messages = [message, ...state.messages];
}

export function fakeClient(state: FakeState) {
  return {
    history: async () => historyOrFail(state),
    identity: async () => "BOT",
    postMessage: (channel: string, text: string) => post(state, channel, text),
    ...reactions(state),
  };
}

function reactions(state: FakeState) {
  return {
    addReaction: (channel: string, ts: string) =>
      react(state, "add", channel, ts),
    removeReaction: (channel: string, ts: string) =>
      react(state, "remove", channel, ts),
  };
}

async function post(state: FakeState, channel: string, text: string) {
  state.posted.push({ channel, text });
  return "9.0";
}

async function react(
  state: FakeState,
  action: "add" | "remove",
  channel: string,
  ts: string,
) {
  state.reactions.push({ action, channel, ts });
}

function historyOrFail(state: FakeState) {
  if (state.failNextHistory) {
    state.failNextHistory = false;
    throw new Error("channel_not_found");
  }
  return state.messages;
}
