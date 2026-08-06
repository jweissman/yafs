import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'bun:test'

import { YafsServer } from '../src/protocol/server'
import { YashClient } from '../src/protocol/client'
import Yafs from '../src'

test('the daemon reconciles its selected configuration without exposing a host path to yash', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yafs-desired-')); const config = join(directory, 'mounts.yaml')
  await writeFile(config, manifest('first'))
  const server = await YafsServer.start({ dataDir: directory, configPath: config })
  const client = await YashClient.connect(server.address())
  expect(JSON.parse(await client.exec('plugins describe agent'))).toMatchObject([{ name: 'agent',
    actions: [{ name: 'send', pseudobinary: 'agent send PERSONA [--context PATH] MESSAGE' }],
    exposures: [{ name: 'conversation', protocol: 'http', status: 'designed' }] }])
  expect(JSON.parse(await client.exec('plugins status'))).toEqual({ configured: true, changes: [],
    active: [{ id: 'demo', plugin: 'fixture', path: '/home/root/demo', state: 'active' }] })
  expect(JSON.parse(await client.exec('plugins plan'))).toEqual([])
  expect(JSON.parse(await client.exec('plugins apply'))).toEqual([])
  expect(await client.exec('cat demo/value.txt')).toBe('first')
  expect(JSON.parse(await client.exec('plugins plan'))).toEqual([])
  await writeFile(config, manifest('second'))
  expect(JSON.parse(await client.exec('plugins plan'))).toEqual([{ id: 'demo', action: 'refresh' }])
  await client.exec('plugins apply'); expect(await client.exec('cat demo/value.txt')).toBe('second')
  await writeFile(config, onlyManifest('keep'))
  expect(JSON.parse(await client.exec('plugins plan'))).toEqual([{ id: 'keep', action: 'activate' }])
  expect(JSON.parse(await client.exec('plugins apply --prune'))).toEqual(
    expect.arrayContaining([{ id: 'demo', action: 'unmount' }, { id: 'keep', action: 'activate' }]))
  await expect(client.exec('cat demo/value.txt')).rejects.toThrow('No such file')
  await client.close(); await server.close()
})

test('plugins refresh forces republishing one plugin from desired config without a manifest path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yafs-desired-refresh-')); const config = join(directory, 'mounts.yaml')
  await writeFile(config, manifest('first'))
  const server = await YafsServer.start({ dataDir: directory, configPath: config })
  const client = await YashClient.connect(server.address())
  await client.exec('plugins apply'); expect(JSON.parse(await client.exec('plugins plan'))).toEqual([])
  expect(JSON.parse(await client.exec('plugins refresh demo'))).toEqual({ id: 'demo', action: 'refresh' })
  expect(await client.exec('cat demo/value.txt')).toBe('first')
  await expect(client.exec('plugins refresh nope')).rejects.toThrow('No desired mount')
  await client.close(); await server.close()
})

test('plugin is the canonical lifecycle command while mount remains compatible', () => {
  const yafs = new Yafs(); yafs.store.write('/home/root/.yafsmeta', manifest('hello'))
  expect(yafs.exec('plugin activate .yafsmeta')).toBe('demo active')
  expect(yafs.execute('mounts status').error?.message).toContain('use plugins')
  expect(yafs.exec('plugin deactivate demo')).toBe('demo deactivated')
})

test('a daemon does not discover desired configuration inside its data directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yafs-no-default-config-'))
  await writeFile(join(directory, 'mounts.yaml'), manifest('ignored'))
  const server = await YafsServer.start({ dataDir: directory })
  const client = await YashClient.connect(server.address())
  expect(JSON.parse(await client.exec('plugins status'))).toEqual({ configured: false, changes: [], active: [] })
  await client.close(); await server.close()
})

function manifest(value: string) {
  return JSON.stringify({ version: 1, plugins: [{ id: 'demo', path: 'demo', plugin: 'fixture',
    config: { files: { 'value.txt': value } }, capabilities: [] }] })
}

function onlyManifest(id: string) {
  return JSON.stringify({ version: 1, plugins: [{ id, path: id, plugin: 'fixture', config: { files: {} }, capabilities: [] }] })
}
