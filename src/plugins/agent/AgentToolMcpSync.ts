import { log } from "../../Logging";
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
  log.error(
    { path },
    "agent tool mcp.json sync skipped: exists but could not be read or " +
      "parsed — fix or remove it manually",
  );
}
