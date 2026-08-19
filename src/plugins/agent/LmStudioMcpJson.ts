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

const YAFS_PREFIX = "yafs-";

export function defaultMcpJsonPath(): string {
  return join(homedir(), ".lmstudio", "mcp.json");
}

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
