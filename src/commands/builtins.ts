import { BuiltinCommand } from "./BuiltinCommand";
import { filesystemCommands } from "./FilesystemCommands";
import { inspectionCommands } from "./InspectionCommands";
import { sessionCommands } from "./SessionCommands";
import { textCommands } from "./TextCommands";
import { traceCommands } from "./TraceCommands";
import { agentCommands } from "./AgentCommands";
import { cacheCommands } from "./CacheCommands";
import { pluginCommands } from "./PluginCommands";
import { slackCommands } from "./SlackCommands";

export function commands(): BuiltinCommand[] {
  return [...coreCommands(), ...pluginFamilyCommands()];
}

function coreCommands(): BuiltinCommand[] {
  return [
    ...sessionCommands(),
    ...filesystemCommands(),
    ...textCommands(),
    ...inspectionCommands(),
  ];
}

function pluginFamilyCommands(): BuiltinCommand[] {
  return [
    ...pluginCommands(),
    ...traceCommands(),
    ...agentCommands(),
    ...cacheCommands(),
    ...slackCommands(),
  ];
}
