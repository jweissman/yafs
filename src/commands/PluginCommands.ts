import { BuiltinCommand } from "./BuiltinCommand";
import { MountsCommand } from "./MountsCommand";
import { PluginsCommand } from "./PluginsCommand";
import { PluginLifecycleCommand } from "./PluginLifecycleCommand";

export function pluginCommands(): BuiltinCommand[] {
  return [
    new MountsCommand(),
    new PluginsCommand(),
    new PluginLifecycleCommand(),
  ];
}
