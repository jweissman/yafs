import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { GitHubResourceReference } from "../github/GitHubCollectionSource";
import { LmStudioOutputItem, LmStudioTurn } from "./LmStudioMcpClient";

// A deterministic receipt, built from the actual tool-call transcript, not
// the model's own prose -- prompt guidance alone already failed once to
// get a model to reliably cite what it looked at. Every read/inspect call
// is durably recorded in runs/<runId>/tools.json regardless; this just
// also surfaces it in the reply itself.
const READ_LIKE_TOOLS = new Set(["yafs.read", "yafs.inspect"]);

export function citationsFooter(
  mounts: MountManager,
  turn: LmStudioTurn,
  elapsedMs: number,
): string {
  return footerFor(mounts, turn, elapsedMs);
}

function footerFor(
  mounts: MountManager, turn: LmStudioTurn, elapsedMs: number,
) {
  const calls = turn.output.filter(isToolCall).length;
  if (!calls) {
    return "";
  }
  return footer(calls, elapsedMs, uniqueCitations(mounts, turn));
}

function footer(calls: number, elapsedMs: number, citations: string[]): string {
  return `\n\n---\n${String(calls)} tool call(s) in ${duration(elapsedMs)}${viewedSuffix(citations)}`;
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

function uniqueCitations(mounts: MountManager, turn: LmStudioTurn): string[] {
  const byKey = new Map<string, string>();
  readPaths(turn).forEach((path) => {
    const citation = citationFor(mounts, path);
    if (citation) {
      byKey.set(citation.key, citation.text);
    }
  });
  return [...byKey.values()];
}

function readPaths(turn: LmStudioTurn): AbsolutePath[] {
  return turn.output
    .filter(isReadLikeCall)
    .map((item) => pathArgument(item.arguments))
    .filter((path): path is AbsolutePath => path !== undefined);
}

function isToolCall(
  item: LmStudioOutputItem,
): item is Extract<LmStudioOutputItem, { type: "tool_call" }> {
  return item.type === "tool_call";
}

function isReadLikeCall(
  item: LmStudioOutputItem,
): item is Extract<LmStudioOutputItem, { type: "tool_call" }> {
  return isToolCall(item) && READ_LIKE_TOOLS.has(item.tool);
}

function pathArgument(args: unknown): AbsolutePath | undefined {
  const path =
    args && typeof args === "object" && "path" in args
      ? args.path
      : undefined;
  return absolutePath(path);
}

function absolutePath(value: unknown): AbsolutePath | undefined {
  return typeof value === "string" && value.startsWith("/")
    ? (value as AbsolutePath)
    : undefined;
}

function citationFor(mounts: MountManager, path: AbsolutePath) {
  const reference = (mounts.resourceReference(path) ??
    parentReference(mounts, path)) as { kind?: string } | undefined;
  return reference?.kind === "github-pr"
    ? githubCitation(reference as GitHubResourceReference)
    : undefined;
}

// resourceReferences are registered at whatever granularity a provider
// considers meaningful (for GitHub, the PR directory) -- a leaf file the
// model actually read (diff.patch, metadata.json) is one level under that,
// so an exact-path lookup alone would miss it.
function parentReference(mounts: MountManager, path: AbsolutePath) {
  const parent = path.slice(0, path.lastIndexOf("/")) as AbsolutePath;
  return mounts.resourceReference(parent);
}

function githubCitation(reference: GitHubResourceReference) {
  const { repository, number, title, url } = reference;
  return {
    key: `${repository}#${String(number)}`,
    // Slack's mrkdwn links are <url|label>, not CommonMark's [label](url)
    // -- yafs posts this text to Slack verbatim (SlackApiClient.postMessage
    // does no markdown translation), so the CommonMark form never rendered
    // as a link there at all, on top of the underscore-collision bug above.
    text: `<${url}|#${String(number)} ${slackSafe(title)}>`,
  };
}

// Slack requires &/</> escaped in message text (its own reserved
// characters); "|" additionally needs neutralizing here since it's the
// delimiter between a <url|label> link's two halves -- a title containing
// a literal "|" would otherwise truncate the label or corrupt the link.
function slackSafe(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "/");
}
