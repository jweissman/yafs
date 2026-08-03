import { expect, test } from 'bun:test'

import Yafs from '../src'
import { GitHubCollectionSource, GitHubPull } from '../src/mounts/GitHubCollectionSource'
import { MountManager } from '../src/mounts/MountManager'
import { ProviderRegistry } from '../src/mounts/ProviderRegistry'
import { NodeStore } from '../src/vfs/NodeStore'

test('review bind durably records the provider revision that an artifact used', async () => {
  const pulls: GitHubPull[] = [pull()]; const yafs = configuredYafs(pulls)
  yafs.store.write('/home/root/.yafsmeta', manifest())
  await yafs.executeAsync('mount activate .yafsmeta'); yafs.exec('mkdir notes'); yafs.exec('review bind reviews/pulls/42 notes/42')
  const binding = JSON.parse(yafs.exec('cat notes/42/source.json'))
  expect(binding).toMatchObject({ sourcePath: '/home/root/reviews/pulls/42', provider: 'github', mountId: 'review' })
  pulls.length = 0; await yafs.executeAsync('mount refresh .yafsmeta')
  expect(yafs.execute('cat reviews/pulls/42/diff.patch').error?.code).toBe('not_found')
  expect(JSON.parse(yafs.exec('cat notes/42/source.json')).revision).toBe(binding.revision)
})

test('review bind refuses a local path or an unknown review action', () => {
  const yafs = new Yafs(); yafs.exec('mkdir notes')
  expect(yafs.execute('review bind notes notes/local').stderr).toContain('not provider-backed')
  expect(yafs.execute('review unknown notes notes/local').stderr).toContain('review requires bind')
})

function configuredYafs(pulls: GitHubPull[]) {
  const store = new NodeStore(); const source = new GitHubCollectionSource({ pulls: async () => pulls })
  const mounts = new MountManager(store, undefined, undefined, undefined, new ProviderRegistry(source))
  return new Yafs({ store, mounts })
}

function pull(): GitHubPull {
  return { number: 42, title: 'Improve resolver', updatedAt: '2026-08-03T00:00:00Z', headSha: 'abc123', diff: 'diff --git' }
}

function manifest() {
  return '{version: 1, mounts: [{id: review, path: reviews, provider: github, config: {repository: acme/widget, query: "is:open", max: 2}, capabilities: [network.github-api]}]}'
}
