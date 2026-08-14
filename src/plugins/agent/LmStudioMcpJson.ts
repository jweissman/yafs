import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type McpServerEntry = { url: string };
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

export function yafsKey(mountId: string, personaName: string): string {
  return `${YAFS_PREFIX}${mountId}-${personaName}`;
}

// undefined distinguishes "file doesn't exist yet" (safe to treat as an
// empty document) from "file exists but failed to parse" (a real file we
// must not silently clobber — the caller should skip the write and log,
// not guess).
export async function readMcpJson(
  path: string,
): Promise<McpJsonDocument | undefined> {
  const raw = await readFile(path, "utf8").catch(() => undefined);
  return raw === undefined ? { mcpServers: {} } : parsed(raw);
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

export async function writeMcpJson(
  path: string,
  document: McpJsonDocument,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
}
