import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";

export interface McpServerEntry {
  url: string;
}
export type McpJsonDocument = {
  mcpServers: Record<string, unknown>;
} & Record<string, unknown>;

// yafs only ever writes/removes keys under this prefix — every other key in
// mcpServers (a user's own manually-configured servers, e.g. `mcp/playwright`
// from LM Studio's own docs) is left completely untouched.
const YAFS_PREFIX = "yafs-";

export function defaultMcpJsonPath(): string {
  return join(homedir(), ".lmstudio", "mcp.json");
}

// Neither mountId nor personaName is restricted from containing "-" by
// manifest validation (mount `id` has no format check at all beyond being
// a string) — a plain `${mountId}-${personaName}` join is genuinely
// ambiguous: mount "a" persona "b-c" and mount "a-b" persona "c" both
// produce "a-b-c", silently pointing one persona's tool calls at another
// persona's roots/budgets. The hash suffix is computed from an unambiguous
// encoding of the exact pair (JSON-array serialization correctly escapes
// whatever either string contains) and is what actually guarantees
// uniqueness; the readable prefix is for a human skimming mcp.json, not a
// safety property — two different pairs can share a prefix, never a key.
export function yafsKey(mountId: string, personaName: string): string {
  const prefix = `${slug(mountId)}-${slug(personaName)}`;
  return `${YAFS_PREFIX}${prefix}-${pairDigest(mountId, personaName)}`;
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "-";
}

function pairDigest(mountId: string, personaName: string): string {
  const input = JSON.stringify([mountId, personaName]);
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

// undefined distinguishes "file doesn't exist yet" (safe to treat as an
// empty document) from "file exists but failed to parse, or couldn't be
// read for any other reason" (a real file we must not silently clobber —
// the caller should skip the write and log, not guess). Only ENOENT is
// "doesn't exist yet"; a permission error, EBUSY, or any other read
// failure must not be collapsed into "safe to treat as empty" the way a
// bare `.catch(() => undefined)` would — that was the exact class of bug
// behind this session's near-incident overwriting a real mcp.json.
export async function readMcpJson(
  path: string,
): Promise<McpJsonDocument | undefined> {
  try {
    return parsed(await readFile(path, "utf8"));
  } catch (error) {
    return isEnoent(error) ? { mcpServers: {} } : undefined;
  }
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function parsed(raw: string): McpJsonDocument | undefined {
  try {
    return normalized(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

function normalized(value: unknown): McpJsonDocument {
  const document = isObject(value) ? value : {};
  const servers = document.mcpServers;
  return { ...document, mcpServers: isObject(servers) ? servers : {} };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergedDocument(
  existing: McpJsonDocument,
  desired: Record<string, McpServerEntry>,
): McpJsonDocument {
  const kept = keptEntries(existing.mcpServers);
  return { ...existing, mcpServers: { ...kept, ...desired } };
}

function keptEntries(mcpServers: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(mcpServers).filter(([key]) => !key.startsWith(YAFS_PREFIX)),
  );
}

// Atomic write: LM Studio may read this file concurrently, so a reader
// must never observe a partially-written document. Write to a uniquely
// named temp file in the same directory (so the rename is same-filesystem
// and therefore atomic), then rename into place.
export async function writeMcpJson(
  path: string,
  document: McpJsonDocument,
): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporary = join(directory, `.mcp.json.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`);
  await rename(temporary, path);
}
