import { AgentConfig, PersonaConfig } from "../../mounts/types";
import { object, only, relative } from "../../mounts/ManifestValidation";

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
  entries.forEach(([name]) => assertPersonaName(name));
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
  only(persona, ["prompt", "endpoint", "model"], "persona");
  assertPrompt(persona.prompt);
  return {
    prompt: persona.prompt,
    endpoint: optionalString(persona.endpoint, "endpoint"),
    model: optionalString(persona.model, "model"),
  };
}

function assertPrompt(prompt: unknown): asserts prompt is string {
  if (typeof prompt !== "string" || !prompt) {
    throw new Error("Invalid persona prompt");
  }
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}
