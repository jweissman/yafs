import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

import { manifest, waitForStatus } from './agent_test_helpers'
import { agentCommands } from '../src/commands/AgentCommands'
import { YafsServer } from '../src/protocol/server'
import { YashClient } from '../src/protocol/client'

test('agent command exposes one mutating command definition', () => {
  expect(agentCommands()).toMatchObject([{ name: 'agent', access: 'mutate' }])
})

test('agent pseudobinaries send, inspect, and cancel a run without ctl JSON', async () => {
  const model = controlledModel()
  const server = await YafsServer.start({ dataDir: await mkdtemp(join(tmpdir(), 'yafs-agent-command-')),
    modelFor: () => model.client })
  const client = await YashClient.connect(server.address())
  await expect(client.exec('agent nope')).rejects.toThrow('agent expects')
  await client.exec(`printf '${manifest({ reviewer: 'prompt' })}' > .yafsmeta`)
  await client.exec('mount activate .yafsmeta')
  expect(await client.exec('agent send agents/reviewer "check this"')).toBe('accepted: agents/reviewer')
  const runId = await waitForStatus(client, 'agents/reviewer/runs', status => status.state === 'running')
  expect(JSON.parse(await client.exec(`agent status agents/reviewer/runs/${runId}`)).state).toBe('running')
  expect(await client.exec(`agent cancel agents/reviewer ${runId}`)).toBe(`cancelling: ${runId}`)
  const status = JSON.parse(await client.exec(`agent status agents/reviewer/runs/${runId}`))
  expect(status.state).toBe('cancelled'); model.resolve('late response')
  await client.close(); await server.close()
})

function controlledModel() {
  let resolve = (_value: string) => undefined
  const client = { complete: () => new Promise<string>(done => { resolve = done }) }
  return { client, resolve: (value: string) => resolve(value) }
}
