import { CommandContext } from "../commands/CommandContext";
import { StartHereValue } from "./WorkspaceOperation";

const RECOMMENDED_FIRST = [
  "yafs.tree on a mounted root to see its structure",
  "yafs.read on a specific file once you've found it via tree/find",
];

export function startHere(context: CommandContext): StartHereValue {
  return { ...orientation(context), recommendedFirst: RECOMMENDED_FIRST };
}

function orientation(context: CommandContext) {
  return {
    kind: "startHere" as const,
    principal: context.user(),
    cwd: context.pwd(),
    now: context.clock.now().toISOString(),
    mounts: context.mountSummaries(),
    scoped: false as const,
  };
}
