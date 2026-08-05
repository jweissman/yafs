import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

import { fakeExchangeModel, waitForRun } from './agent_test_helpers'
import { YafsServer } from '../src/protocol/server'
import { YashClient } from '../src/protocol/client'

test('a review run consumes a reified trace and preserves the exact diff context', async () => {
  const calls: Array<{ system: string, message: string }> = []
  const server = await YafsServer.start({ dataDir: await mkdtemp(join(tmpdir(), 'yafs-context-review-')),
    modelFor: () => fakeExchangeModel('review: looks safe', calls) })
  const client = await YashClient.connect(server.address())
  await client.exec(`printf '${manifest()}' > .yafsmeta`)
  await client.exec('mount activate .yafsmeta source'); await client.exec('mount activate .yafsmeta agents')
  await client.exec('mkdir artifacts')
  await client.exec('trace source artifacts/review-42'); await client.exec('reify artifacts/review-42 restored-42')
  await client.exec('agent send agents/reviewer --context restored-42/diff.patch "Review PR 42"')
  const runId = await waitForRun(client, 'agents/reviewer/runs')
  expect(await client.exec(`cat agents/reviewer/runs/${runId}/context.md`)).toBe('diff: safe change')
  expect(calls[0].message).toContain('diff: safe change')
  expect(await client.exec(`cat agents/reviewer/runs/${runId}/response.md`)).toBe('review: looks safe')
  await client.close(); await server.close()
})

function manifest() {
  return '{version: 1, mounts: [{id: source, path: source, provider: fixture, config: {files: {"diff.patch": "diff: safe change"}}, capabilities: []}, '
    + '{id: agents, path: agents, provider: agent, config: {personas: {reviewer: {prompt: "reviewer"}}}, capabilities: [chat.completion]}]}'
}
