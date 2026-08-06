import { expect, test } from 'bun:test'

import Yafs from '../src'
import { SlackCollectionSource, SlackClient } from '../src/mounts/SlackCollectionSource'
import { MountManager } from '../src/mounts/MountManager'
import { ProviderRegistry } from '../src/mounts/ProviderRegistry'
import { NodeStore } from '../src/vfs/NodeStore'

test('a Slack channel becomes an ordered, immutable message snapshot', async () => {
  const yafs = configuredYafs(new ProviderRegistry(undefined, undefined, new SlackCollectionSource(fakeClient())))
  yafs.store.write('/home/root/.yafsmeta', slackManifest())
  expect((await yafs.executeAsync('mount activate .yafsmeta')).stdout).toBe('updates active')
  const lines = yafs.exec('cat updates/messages.ndjson').split('\n').map(line => JSON.parse(line))
  expect(lines).toEqual([{ user: 'U1', text: 'first', ts: '1.0' }, { user: 'U2', text: 'second', ts: '2.0' }])
  expect(JSON.parse(yafs.exec('inspect updates/messages.ndjson')).origins[0]).toMatchObject({
    provider: 'slack', mountId: 'updates', revision: expect.stringMatching(/^slack:/) })
  expect(JSON.parse(yafs.exec('plugins describe slack'))).toMatchObject([{ name: 'slack',
    actions: [{ name: 'send', capability: 'network.slack-api', pseudobinary: 'slack send PLUGIN_ID MESSAGE' }] }])
})

test('a Slack manifest requires both capabilities and rejects unknown configuration', () => {
  const yafs = configuredYafs(new ProviderRegistry(undefined, undefined, new SlackCollectionSource(fakeClient())))
  yafs.store.write('/home/root/.yafsmeta', slackManifest().replace('secret.slack-token', 'secret.other'))
  expect(yafs.execute('mount activate .yafsmeta').stderr)
    .toBe('Capabilities are not granted: secret.other')
  yafs.store.write('/home/root/.yafsmeta', slackManifest().replace('max: 10', 'unknown: 10'))
  expect(yafs.execute('mount validate .yafsmeta').stderr)
    .toBe('Unknown slack config field: unknown (expected one of: channel, max)')
})

test('an unconfigured Slack provider fails clearly instead of silently publishing nothing', async () => {
  const yafs = configuredYafs(new ProviderRegistry())
  yafs.store.write('/home/root/.yafsmeta', slackManifest())
  await expect(yafs.executeAsync('mount activate .yafsmeta')).resolves.toMatchObject({
    stderr: 'Slack provider is not configured' })
})

function configuredYafs(providers: ProviderRegistry) {
  const store = new NodeStore()
  return new Yafs({ store, mounts: new MountManager(store, undefined, undefined, undefined, providers) })
}

function fakeClient(): SlackClient {
  return { history: async () => [{ user: 'U2', text: 'second', ts: '2.0' }, { user: 'U1', text: 'first', ts: '1.0' }] }
}

function slackManifest() {
  return '{version: 1, mounts: [{id: updates, path: updates, provider: slack, config: {channel: C123, max: 10}, '
    + 'capabilities: [network.slack-api, secret.slack-token]}]}'
}
