import { CommandContext } from "../commands/CommandContext";
import { StartHereValue } from "./WorkspaceOperation";

const RECOMMENDED_FIRST = [
  "yafs.tree on a mounted root to see its structure",
  "yafs.read on a specific file once you've found it via tree/find",
];

// `now` exists because nothing else ever told a persona the current
// date/time: it could compare a mount's own fetchedAt or a PR's
// updatedAt to *each other*, but never to "today," so it had no way to
// reason about staleness (e.g. "this hasn't been touched in three
// weeks") at all -- only relative ordering between PRs.
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
