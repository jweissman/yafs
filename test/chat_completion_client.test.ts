import { expect, test } from 'bun:test'

import { ChatCompletionClient, chatCompletionClientFor } from '../src/agents/ChatCompletionClient'
import { chatCompletionSettings } from '../src/agents/ChatCompletionSettings'

test('the chat completion client sends a system/user request and returns the completion text', async () => {
  const requests: Request[] = []
  const client = new ChatCompletionClient({ apiUrl: 'http://localhost:1234/v1', model: 'local-model' }, fakeFetch(requests))
  const reply = await client.complete('You are a helpful reviewer.', 'Summarize this diff.')
  expect(reply).toBe('Looks good to me.')
  expect(requests).toHaveLength(1); expect(requests[0].url).toBe('http://localhost:1234/v1/chat/completions')
  const body = await requests[0].json()
  expect(body).toEqual({ model: 'local-model',
    messages: [{ role: 'system', content: 'You are a helpful reviewer.' }, { role: 'user', content: 'Summarize this diff.' }] })
})

test('the chat completion client omits model when none is configured', async () => {
  const requests: Request[] = []
  const client = new ChatCompletionClient({ apiUrl: 'http://localhost:1234/v1' }, fakeFetch(requests))
  await client.complete('system', 'message')
  const body = await requests[0].json() as { model?: string }
  expect(body.model).toBeUndefined()
})

test('the chat completion client reports non-successful responses with the response body', async () => {
  const client = new ChatCompletionClient({ apiUrl: 'http://localhost:1234/v1' },
    async () => new Response('model not loaded', { status: 503, statusText: 'Service Unavailable' }))
  const failure = client.complete('system', 'message')
  await expect(failure).rejects.toThrow('Chat completion request failed: 503')
  await expect(failure).rejects.toThrow('body: model not loaded')
})

test('the chat completion client times out a stalled request instead of hanging forever', async () => {
  const client = new ChatCompletionClient({ apiUrl: 'http://localhost:1234/v1' }, hangingFetch(), 20)
  const failure = client.complete('system', 'message')
  await expect(failure).rejects.toThrow('Chat completion request timed out after 20ms')
})

test('a 200 response with an unexpected shape reports the raw body, not just a generic message', async () => {
  const client = new ChatCompletionClient({ apiUrl: 'http://localhost:1234/v1' }, async () => json({ ok: true }))
  await expect(client.complete('system', 'message')).rejects.toThrow('no message content: {"ok":true}')
})

test('chatCompletionSettings defaults to the standard local endpoint and honors env overrides', () => {
  expect(chatCompletionSettings({})).toEqual({ apiUrl: 'http://localhost:1234/v1', model: undefined })
  const custom = chatCompletionSettings({ YAFS_LLM_BASE_URL: 'http://elsewhere:9999/v1/', YAFS_LLM_MODEL: 'llama' })
  expect(custom).toEqual({ apiUrl: 'http://elsewhere:9999/v1', model: 'llama' })
})

test('chatCompletionClientFor prefers persona config, then mount config, then the env default', () => {
  const persona = chatCompletionClientFor({ prompt: 'p', endpoint: 'http://persona:1/v1' }, { endpoint: 'http://mount:1/v1' })
  expect(persona).toBeInstanceOf(ChatCompletionClient)
  const mountFallback = chatCompletionClientFor({ prompt: 'p' }, { endpoint: 'http://mount:1/v1' })
  expect(mountFallback).toBeInstanceOf(ChatCompletionClient)
})

function fakeFetch(requests: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init)); return json({ choices: [{ message: { content: 'Looks good to me.' } }] })
  }
}

function hangingFetch() {
  return (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) =>
    init?.signal?.addEventListener('abort', () => reject(new DOMException('signal timed out', 'TimeoutError'))))
}

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }) }
