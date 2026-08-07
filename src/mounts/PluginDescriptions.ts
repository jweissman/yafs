import {
  Plugin,
  PluginActionDefinition,
  PluginExposureDefinition,
} from "./Plugin";

export type PluginDescription = {
  name: string;
  capabilities: string[];
  actions: PluginActionDefinition[];
  exposures: PluginExposureDefinition[];
};

export function describePlugins(
  definitions: Map<string, Plugin>,
  name?: string,
): PluginDescription[] {
  return selected(definitions, name).map(description);
}

function selected(definitions: Map<string, Plugin>, name?: string) {
  if (!name) {
    return [...definitions.values()];
  }
  return [named(definitions, name)];
}

function named(definitions: Map<string, Plugin>, name: string) {
  const definition = definitions.get(name);
  if (!definition) {
    throw new Error(`Unknown provider: ${name}`);
  }
  return definition;
}

function description(definition: Plugin): PluginDescription {
  return {
    name: definition.name,
    capabilities: definition.capabilities(),
    actions: definition.actions(),
    exposures: definition.exposures(),
  };
}
