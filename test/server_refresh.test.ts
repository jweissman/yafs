import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GitHubCollectionSource } from '../src/mounts/GitHubCollectionSource'
import { ProviderRegistry } from '../src/mounts/ProviderRegistry'
import { YashClient } from '../src/protocol/client'
import { YafsServer } from '../src/protocol/server'

test('a failed scheduled refresh does not sever an unrelated client connection', async () => {
  const server = await YafsServer.start({ dataDir: await mkdtemp(join(tmpdir(), 'yafs-refresh-failure-')),
    now: () => Date.now() + 120_000, providers: new ProviderRegistry(new GitHubCollectionSource(unreliableClient())) })
  const client = await YashClient.connect(server.address())
  await client.exec(`printf '${scheduledManifest()}' > .yafsmeta`); await client.exec('mount activate .yafsmeta')
  await server.refreshDue()
  expect(await client.exec('echo still alive')).toBe('still alive')
  await client.close(); await server.close()
})

function unreliableClient() {
  let calls = 0
  return { pulls: async () => { calls++; if (calls > 1) throw new Error('network unreachable'); return [pull()] } }
}
function pull() { return { number: 42, title: 'Review', updatedAt: '2026-08-03T00:00:00Z', headSha: 'abc123', diff: 'diff --git' } }
function scheduledManifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, '
    + 'config: {repository: acme/widget, query: "is:open", max: 2}, refresh: {interval: 1m}, capabilities: [network.github-api]}]}'
}
