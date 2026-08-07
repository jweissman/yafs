import { BuiltinCommand } from "./BuiltinCommand";
import { filesystemCommands } from "./FilesystemCommands";
import { inspectionCommands } from "./InspectionCommands";
import { sessionCommands } from "./SessionCommands";
import { textCommands } from "./TextCommands";
import { traceCommands } from "./TraceCommands";
import { cacheCommands } from "./CacheCommands";
import { pluginCommands } from "./PluginCommands";
import { pluginKinds } from "../mounts/PluginKinds";

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
    ...cacheCommands(),
    ...pluginKinds().flatMap((plugin) => plugin.commands()),
  ];
}
