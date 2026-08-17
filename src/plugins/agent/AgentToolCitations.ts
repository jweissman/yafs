import { MountManager } from "../../mounts/MountManager";
import { LmStudioOutputItem, LmStudioTurn } from "./LmStudioMcpClient";
import { uniqueCitations } from "./AgentCitationLookup";

// A deterministic receipt, built from the actual tool-call transcript, not
// the model's own prose -- prompt guidance alone already failed once to
// get a model to reliably cite what it looked at. Every read/inspect call
// is durably recorded in runs/<runId>/tools.json regardless; this just
// also surfaces it in the reply itself.

// Always emits a footer, even at zero calls -- that used to be the one
// case this returned empty, which is exactly backwards: zero tool calls
// on a turn that makes specific claims is the single most important thing
// to surface, not the one case to stay silent about. Live-observed
// failure this fixes: asked to "review 29795 carefully," a persona's own
// reasoning said "already did [read the diff]," made zero tool calls this
// turn, and then invented a specific, false claim ("a quick grep across
// the repo shows no remaining hard-coded instances") that couldn't have
// happened even in principle -- the mount holds one PR's diff/metadata,
// never a checked-out repository. A silent footer gave that no signal at
// all; an explicit "0 tool calls" would have.
export function citationsFooter(
  mounts: MountManager,
  turn: LmStudioTurn,
  elapsedMs: number,
): string {
  const calls = turn.output.filter(isToolCall).length;
  return footer(calls, elapsedMs, uniqueCitations(mounts, turn));
}

// "this turn," not just "N tool call(s)": in a threaded conversation the
// model can accurately recall something it verified in an earlier turn
// without a fresh tool call now -- true, but easy to misread as this
// reply's claims being unverified if the count looks low against how much
// the reply actually says. Scoping the label to what it really measures
// beats a fresh reader guessing wrong.
function footer(calls: number, elapsedMs: number, citations: string[]): string {
  return `\n\n---\n${summary(calls, elapsedMs)}${viewedSuffix(citations)}`;
}

function summary(calls: number, elapsedMs: number): string {
  return calls
    ? `${String(calls)} tool call(s) this turn, in ${duration(elapsedMs)}`
    : `0 tool calls this turn (${duration(elapsedMs)}) -- nothing above was freshly verified`;
}

// Local model inference has no per-token cost worth tracking here, but
// wall-clock time is worth surfacing where it's actually visible (the
// reply itself), not just buried as startedAt/completedAt math someone
// would have to do by hand against status.json.
function duration(elapsedMs: number): string {
  const seconds = Math.round(elapsedMs / 1000);
  return seconds < 60
    ? `${String(seconds)}s`
    : `${String(Math.floor(seconds / 60))}m${String(seconds % 60).padStart(2, "0")}s`;
}

// No emphasis markup (_..._ / *...*) around this line: it's built from
// provider content (a PR title) that yafs doesn't control the characters
// of. Live-observed failure this avoids: a title containing its own
// underscore collided with an outer _..._ wrapper and visibly mangled the
// rendered text in Slack.
function viewedSuffix(citations: string[]): string {
  return citations.length
    ? `. Viewed:\n${citations.map((line) => `- ${line}`).join("\n")}`
    : ".";
}

export function isToolCall(
  item: LmStudioOutputItem,
): item is Extract<LmStudioOutputItem, { type: "tool_call" }> {
  return item.type === "tool_call";
}
