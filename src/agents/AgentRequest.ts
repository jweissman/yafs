import { PersonaConfig } from '../mounts/types'
import { ModelClient } from './ChatCompletionClient'

export type AgentRequest = { message: string, context?: string }

export function parseAgentRequest(payload: string): AgentRequest {
  const value = JSON.parse(payload) as { message?: unknown, context?: unknown }
  return validRequest(value, payload)
}

function validRequest(value: { message?: unknown, context?: unknown }, payload: string): AgentRequest {
  const { message, context } = value; if (typeof message !== 'string') throw new Error(`Invalid agent action: ${payload}`)
  if (context !== undefined && typeof context !== 'string') throw new Error(`Invalid agent action: ${payload}`)
  return { message, context: context as string | undefined }
}

export function completeAgent(model: ModelClient, persona: PersonaConfig, request: AgentRequest) {
  return model.complete(persona.prompt, modelMessage(request))
}

function modelMessage(request: AgentRequest) { return request.context ? `${request.message}\n\nContext:\n${request.context}` : request.message }
