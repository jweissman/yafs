import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Yafs from '../src'
import { MountManager } from '../src/mounts/MountManager'
import { YashClient } from '../src/protocol/client'
import { YafsServer } from '../src/protocol/server'
import { NodeStore } from '../src/vfs/NodeStore'

test('a refresh republishes one snapshot for direct, link, and union reads', () => {
  const yafs = mountedWorkspace()
  yafs.exec('ln -s fixture/hello.txt latest'); yafs.exec('mkdir notes')
  yafs.exec('echo local > notes/local.txt'); yafs.exec('union review notes fixture')
  yafs.store.write('/home/root/.yafsmeta', fixtureManifest('updated'))
  expect(yafs.exec('mount refresh .yafsmeta')).toBe('demo refreshed')
  expect(yafs.exec('cat fixture/hello.txt')).toBe('updated')
  expect(yafs.exec('cat latest')).toBe('updated')
  expect(yafs.exec('cat review/hello.txt')).toBe('updated')
  expect(yafs.execute('echo changed > fixture/hello.txt').error?.code).toBe('read_only_mount')
  expect(yafs.execute('echo changed > review/new.txt').error?.code).toBe('read_only_mount')
})

test('a bounded snapshot is rejected before it becomes a mount', () => {
  const store = new NodeStore(); const mounts = new MountManager(store, undefined, undefined, { files: 0, bytes: 1 })
  const yafs = new Yafs({ store, mounts }); yafs.store.write('/home/root/.yafsmeta', fixtureManifest('hello'))
  expect(yafs.execute('mount activate .yafsmeta').stderr).toBe('Snapshot exceeds 0 files')
  expect(yafs.execute('cat fixture/hello.txt').error?.code).toBe('not_found')
})

test('an unmounted union layer disappears and a remount rejoins by path', () => {
  const yafs = mountedWorkspace(); yafs.exec('mkdir notes'); yafs.exec('echo local > notes/local.txt')
  yafs.exec('ln -s fixture/hello.txt latest'); yafs.exec('union review notes fixture'); const revision = fixtureRevision(yafs)
  yafs.exec('mount unmount demo')
  expect(yafs.exec('ls review')).toBe('local.txt')
  expect(yafs.execute('cat review/hello.txt').error?.code).toBe('not_found')
  expect(yafs.execute('cat latest').error?.code).toBe('not_found')
  yafs.store.write('/home/root/.yafsmeta', fixtureManifest('again')); yafs.exec('mount activate .yafsmeta')
  expect(yafs.exec('cat review/hello.txt')).toBe('again')
  expect(yafs.exec('cat latest')).toBe('again')
  expect(fixtureRevision(yafs)).not.toBe(revision)
})

test('recovery preserves a union through refresh, unmount, and remount', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yafs-refresh-'))
  const server = await YafsServer.start({ dataDir: directory })
  const client = await YashClient.connect(server.address())
  await client.exec(`printf '${fixtureManifest('hello')}' > .yafsmeta`)
  await client.exec('mount activate .yafsmeta')
  await client.exec('mkdir notes'); await client.exec('union review notes fixture')
  await client.exec(`printf '${fixtureManifest('recovered')}' > .yafsmeta`)
  await client.exec('mount refresh .yafsmeta'); await client.exec('mount unmount demo')
  await client.exec('mount activate .yafsmeta'); await client.close(); await server.close()
  const restored = await YafsServer.start({ dataDir: directory })
  const verified = await YashClient.connect(restored.address())
  expect(await verified.exec('cat /home/root/review/hello.txt')).toBe('recovered')
  await verified.close(); await restored.close()
})

function mountedWorkspace() {
  const yafs = new Yafs(); yafs.store.write('/home/root/.yafsmeta', fixtureManifest('hello'))
  yafs.exec('mount activate .yafsmeta'); return yafs
}

function fixtureManifest(content: string) {
  return `{version: 1, mounts: [{id: demo, path: fixture, provider: fixture, config: {files: {hello.txt: ${content}}}, capabilities: []}]}`
}

function fixtureRevision(yafs: Yafs) {
  return JSON.parse(yafs.exec('inspect fixture/hello.txt')).origins[0].revision
}
