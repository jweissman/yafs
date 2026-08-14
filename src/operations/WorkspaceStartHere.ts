import { CommandContext } from "../commands/CommandContext";
import { StartHereValue } from "./WorkspaceOperation";

const RECOMMENDED_FIRST = [
  "yafs.tree on a mounted root to see its structure",
  "yafs.read on a specific file once you've found it via tree/find",
];

export function startHere(context: CommandContext): StartHereValue {
  return {
    kind: "startHere",
    principal: context.user(),
    cwd: context.pwd(),
    mounts: context.mountSummaries(),
    scoped: false,
    recommendedFirst: RECOMMENDED_FIRST,
  };
}
