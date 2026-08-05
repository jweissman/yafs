import { PluginActionDefinition, PluginExposureDefinition, ProviderDefinition } from './ProviderDefinition'

export type PluginDescription = {
  name: string, capabilities: string[], actions: PluginActionDefinition[], exposures: PluginExposureDefinition[]
}

export function describePlugins(definitions: Map<string, ProviderDefinition>, name?: string): PluginDescription[] {
  return selected(definitions, name).map(description)
}

function selected(definitions: Map<string, ProviderDefinition>, name?: string) {
  if (!name) return [...definitions.values()]
  return [named(definitions, name)]
}

function named(definitions: Map<string, ProviderDefinition>, name: string) {
  const definition = definitions.get(name); if (!definition) throw new Error(`Unknown provider: ${name}`)
  return definition
}

function description(definition: ProviderDefinition): PluginDescription {
  return { name: definition.name, capabilities: definition.capabilities(),
    actions: definition.actions?.() || [], exposures: definition.exposures?.() || [] }
}
