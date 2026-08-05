import { PluginActionDefinition, PluginExposureDefinition } from '../mounts/ProviderDefinition'

export function agentActions(): PluginActionDefinition[] {
  return [{ name: 'send', capability: 'chat.completion', transport: 'ctl',
    pseudobinary: 'agent send PERSONA [--context PATH] MESSAGE' }]
}

export function agentExposures(): PluginExposureDefinition[] {
  return [{ name: 'conversation', protocol: 'http', status: 'designed' }]
}
