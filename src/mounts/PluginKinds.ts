import { Plugin } from "./Plugin";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import { GitHubPlugin } from "../plugins/github/GitHubPlugin";
import { AgentPlugin } from "../plugins/agent/AgentPlugin";
import { SlackPlugin } from "../plugins/slack/SlackPlugin";
import { SchedulerPlugin } from "../plugins/scheduler/SchedulerPlugin";

export function pluginKinds(): Plugin[] {
  return [
    new FixturePlugin(),
    new AgentPlugin(),
    new GitHubPlugin(),
    new SlackPlugin(),
    new SchedulerPlugin(),
  ];
}
