import { AbsolutePath } from "../../core/AbsolutePath";
import { MountManager } from "../../mounts/MountManager";
import { Citation, CitationRenderer } from "../../mounts/Plugin";
import { pluginKinds } from "../../mounts/PluginKinds";
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
    byKey.set(citation.key, formatted(citation));
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
    args && typeof args === "object" && "path" in args ? args.path : undefined;
  return absolutePath(path);
}

function absolutePath(value: unknown): AbsolutePath | undefined {
  return typeof value === "string" && value.startsWith("/")
    ? (value as AbsolutePath)
    : undefined;
}

function citationFor(mounts: MountManager, path: AbsolutePath) {
  const reference = mounts.resourceReference(path) ?? parent(mounts, path);
  if (!reference) {
    return undefined;
  }
  const kind = (reference as { kind?: unknown }).kind;
  return typeof kind === "string"
    ? rendererFor(kind)?.render(reference)
    : undefined;
}

function parent(mounts: MountManager, path: AbsolutePath) {
  const dir = path.slice(0, path.lastIndexOf("/")) as AbsolutePath;
  return mounts.resourceReference(dir);
}

function rendererFor(kind: string): CitationRenderer | undefined {
  return renderers().find((renderer) => renderer.kind === kind);
}

function renderers(): CitationRenderer[] {
  return pluginKinds().flatMap((plugin) => plugin.citationRenderers());
}

function formatted(citation: Citation): string {
  return `<${citation.url}|${slackSafe(citation.label)}>`;
}

function slackSafe(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "/");
}
