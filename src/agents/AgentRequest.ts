import { PersonaConfig } from '../mounts/types'
import { ModelClient } from './ChatCompletionClient'

export type AgentRequest = { message: string, context?: string, runId?: string }

export function parseAgentRequest(payload: string): AgentRequest {
  const value = JSON.parse(payload) as { message?: unknown, context?: unknown, runId?: unknown }
  return validRequest(value, payload)
}

function validRequest(value: { message?: unknown, context?: unknown, runId?: unknown }, payload: string): AgentRequest {
  const { message, context, runId } = value; if (typeof message !== 'string') throw new Error(`Invalid agent action: ${payload}`)
  assertOptionalString(context, payload); assertOptionalString(runId, payload)
  return { message, context: context as string | undefined, runId: runId as string | undefined }
}

function assertOptionalString(value: unknown, payload: string) {
  if (value !== undefined && typeof value !== 'string') throw new Error(`Invalid agent action: ${payload}`)
}

export function completeAgent(model: ModelClient, persona: PersonaConfig, request: AgentRequest) {
  return model.complete(persona.prompt, modelMessage(request))
}

function modelMessage(request: AgentRequest) { return request.context ? `${request.message}\n\nContext:\n${request.context}` : request.message }
