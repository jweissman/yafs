import { Plugin } from "./Plugin";
import { FixturePlugin } from "../plugins/fixture/FixturePlugin";
import { GitHubPlugin } from "../plugins/github/GitHubPlugin";
import { AgentPlugin } from "../plugins/agent/AgentPlugin";
import { SlackPlugin } from "../plugins/slack/SlackPlugin";

// Cold, no-args instances for shape-only work (config parsing, provider-name
// validity, command listing). Never call .capabilities()/.prepare() on these —
// those can depend on live injected sources; use ProviderRegistry instead.
export function pluginKinds(): Plugin[] {
  return [
    new FixturePlugin(),
    new AgentPlugin(),
    new GitHubPlugin(),
    new SlackPlugin(),
  ];
}
