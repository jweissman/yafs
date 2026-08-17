import { MountManager } from "../../mounts/MountManager";
import { AgentConfig, PreparedMountRecord } from "../../mounts/types";
import { validAgentConfig } from "./AgentConfigValidation";
import {
  McpJsonDocument,
  McpServerEntry,
  mergedDocument,
  readMcpJson,
  writeMcpJson,
  yafsKey,
} from "./LmStudioMcpJson";

export type UrlFor = (mountId: string, personaName: string) => string;

// A PluginDriver (no `start()`, so BackgroundDrivers.startAll() calls
// `sync()` at daemon startup too — see mounts/Plugin.ts). Keeps a chosen
// mcp.json's yafs-owned entries matching whichever personas are currently
// tool-enabled, so LM Studio's `plugin` integration type (the only one that
// accepts a loopback URL — see LM Studio's SSRF guard on `ephemeral_mcp`)
// can find them without any manual mcp.json editing.
//
// `path` has NO default. This touches a real file outside the project
// (normally `~/.lmstudio/mcp.json` — see LmStudioMcpJson.ts's
// `defaultMcpJsonPath`), and countless tests construct a full YafsServer
// via `pluginDrivers()` without ever intending to touch it. A missing path
// means "do nothing," not "guess the real one" — only `yafsd.ts` (the real
// binary) should ever supply `defaultMcpJsonPath()` explicitly. Learned
// this the hard way: an earlier version defaulted to the real path and a
// single `bun test` run overwrote the developer's actual mcp.json.
export class AgentToolMcpSync {
  constructor(
    private readonly mounts: MountManager,
    private readonly urlFor: UrlFor,
    private readonly path?: string,
  ) {}

  close() {
    return undefined;
  }

  sync() {
    if (this.path) {
      void this.reconcile(this.path);
    }
  }

  private async reconcile(path: string) {
    const existing = await readMcpJson(path);
    if (!existing) {
      logUnreadable(path);
      return;
    }
    await this.writeIfChanged(path, existing);
  }

  private async writeIfChanged(path: string, existing: McpJsonDocument) {
    const merged = mergedDocument(existing, this.desiredEntries());
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
      await writeMcpJson(path, merged);
    }
  }

  private desiredEntries(): Record<string, McpServerEntry> {
    return Object.fromEntries(
      toolEnabledPersonas(this.mounts).map(({ mountId, personaName }) => [
        yafsKey(mountId, personaName),
        { url: this.urlFor(mountId, personaName) },
      ]),
    );
  }
}

function toolEnabledPersonas(mounts: MountManager) {
  return mounts.mounts().flatMap(personasFor);
}

function personasFor(record: PreparedMountRecord) {
  if (record.provider !== "agent") {
    return [];
  }
  const config = validAgentConfig(record.config);
  return config ? toolEnabledEntries(record.id, config) : [];
}

function toolEnabledEntries(mountId: string, config: AgentConfig) {
  return Object.entries(config.personas)
    .filter(([, persona]) => persona.tools)
    .map(([personaName]) => ({ mountId, personaName }));
}

function logUnreadable(path: string) {
  console.error(
    `agent tool mcp.json sync skipped: ${path} exists but could not be ` +
      "read or parsed — fix or remove it manually.",
  );
}
