import { CommandContext } from "./CommandContext";
import { lifecycle } from "./MountLifecycle";

export class PluginLifecycleCommand {
  readonly name = "plugin";
  readonly access = "control";
  readonly synopsis = "plugin deactivate ID|--all";

  constructor() {}
  execute(context: CommandContext, args: string[]): string | Promise<string> {
    return lifecycle(context, args);
  }
}
