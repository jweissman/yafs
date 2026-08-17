import {
  AgentConfig,
  PersonaConfig,
  PersonaToolsConfig,
} from "../../mounts/types";
import { object, only, relative } from "../../mounts/ManifestValidation";
import {
  assertPrompt,
  optionalNumber,
  optionalString,
} from "./AgentManifestValues";

export function agentConfig(value: unknown): AgentConfig {
  const config = object(value, "agent config");
  only(config, ["personas", "endpoint", "model"], "agent config");
  const personas = personaMap(config.personas);
  return {
    personas,
    endpoint: optionalString(config.endpoint, "endpoint"),
    model: optionalString(config.model, "model"),
  };
}

function personaMap(value: unknown): Record<string, PersonaConfig> {
  const entries = Object.entries(object(value, "agent personas"));
  if (!entries.length) {
    throw new Error("Invalid agent personas: at least one required");
  }
  entries.forEach(([name]) => {
    assertPersonaName(name);
  });
  return personaEntries(entries);
}

function personaEntries(
  entries: [string, unknown][],
): Record<string, PersonaConfig> {
  return Object.fromEntries(
    entries.map(([name, persona]) => [name, personaConfig(persona)]),
  );
}

function assertPersonaName(name: string) {
  if (!relative(name) || name.includes("/")) {
    throw new Error("Invalid persona name");
  }
}

function personaConfig(value: unknown): PersonaConfig {
  const persona = object(value, "persona");
  only(persona, ["prompt", "endpoint", "model", "tools"], "persona");
  assertPrompt(persona.prompt);
  return { prompt: persona.prompt, ...personaOptions(persona) };
}

function personaOptions(persona: Record<string, unknown>) {
  return {
    endpoint: optionalString(persona.endpoint, "endpoint"),
    model: optionalString(persona.model, "model"),
    tools: toolsConfig(persona.tools),
  };
}

const TOOLS_FIELDS = ["roots", "maxResultBytes", "maxCalls", "deadlineMs"];

function toolsConfig(value: unknown): PersonaToolsConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  const tools = object(value, "persona tools");
  only(tools, TOOLS_FIELDS, "persona tools");
  return { roots: rootsList(tools.roots), ...toolsBudgets(tools) };
}

function toolsBudgets(tools: Record<string, unknown>) {
  return {
    maxResultBytes: optionalNumber(tools.maxResultBytes, "maxResultBytes"),
    maxCalls: optionalNumber(tools.maxCalls, "maxCalls"),
    deadlineMs: optionalNumber(tools.deadlineMs, "deadlineMs"),
  };
}

function rootsList(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error("Invalid persona tools roots: at least one required");
  }
  return value.map(assertRoot);
}

function assertRoot(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    throw new Error("Invalid persona tools root: must be an absolute path");
  }
  return value;
}
