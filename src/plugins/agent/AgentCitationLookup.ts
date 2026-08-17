import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { GitHubResourceReference } from "../github/GitHubCollectionSource";
import { LmStudioOutputItem, LmStudioTurn } from "./LmStudioMcpClient";
import { isToolCall } from "./AgentToolCitations";

const READ_LIKE_TOOLS = new Set(["yafs.read", "yafs.inspect"]);

export function uniqueCitations(
  mounts: MountManager,
  turn: LmStudioTurn,
): string[] {
  const byKey = new Map<string, string>();
  readPaths(turn).forEach((path) => {
    addCitation(byKey, mounts, path);
  });
  return [...byKey.values()];
}

function addCitation(
  byKey: Map<string, string>,
  mounts: MountManager,
  path: AbsolutePath,
) {
  const citation = citationFor(mounts, path);
  if (citation) {
    byKey.set(citation.key, citation.text);
  }
}

function readPaths(turn: LmStudioTurn): AbsolutePath[] {
  return turn.output
    .filter(isReadLikeCall)
    .map((item) => pathArgument(item.arguments))
    .filter((path): path is AbsolutePath => path !== undefined);
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
  return reference?.kind === "github-pr" && isGithubReference(reference)
    ? githubCitation(reference)
    : undefined;
}

type ReferenceFields = Partial<Record<keyof GitHubResourceReference, unknown>>;

// A resourceReference is durable, on-disk JSON that can predate a shape
// change to what a provider writes into it (live-observed: a reference
// persisted before `url` was added had no such field, and interpolating
// it unchecked rendered a literal "<undefined|...>" link in Slack). Skip
// a reference missing a field this citation needs rather than emit a
// broken one -- the mount's own refresh cycle will pick up the new shape.
function isGithubReference(
  reference: object,
): reference is GitHubResourceReference {
  return hasRequiredFields(reference);
}

function hasRequiredFields(fields: ReferenceFields): boolean {
  const { repository, number, title, url } = fields;
  return (
    typeof repository === "string" &&
    typeof number === "number" &&
    typeof title === "string" &&
    typeof url === "string"
  );
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
