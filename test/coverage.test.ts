import { expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { clearState, currentState, isRunning, paths, readState, writeState } from '../src/daemon'
import { FixtureProvider } from '../src/mounts/FixtureProvider'
import { LocalYashClient } from '../src/protocol/local'
import { Shell } from '../src/Shell'
import { PathResolver } from '../src/core/PathResolver'
import { normalize } from '../src/core/PathResolver'
import { attachLines, parseRequest, persistenceFailure, requestFailure, respond } from '../src/protocol/Framing'
import { NodeStore } from '../src/vfs/NodeStore'
import { variable } from '../src/YafsValues'
import Yafs from '../src'

test('daemon state helpers validate, replace, and remove state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yafs-daemon-state-'))
  const statePath = paths(directory).state
  expect(await readState(statePath)).toBeUndefined()
  const state = await writeState(statePath, { host: '127.0.0.1', port: 7337 })
  expect(await currentState(statePath)).toEqual(state)
  await clearState(statePath); expect(await readState(statePath)).toBeUndefined()
  await writeFile(statePath, '{invalid')
  await expect(readState(statePath)).rejects.toThrow()
})

test('daemon state removes a stale process record', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yafs-daemon-stale-'))
  const statePath = paths(directory).state
  await writeFile(statePath, JSON.stringify({ version: 1, pid: 999999, host: '127.0.0.1',
    port: 7337, startedAt: '2026-01-01T00:00:00.000Z', instanceId: 'stale' }))
  expect(isRunning(999999)).toBe(false)
  expect(await currentState(statePath)).toBeUndefined()
})

test('local client completes paths and returns no matches for missing directories', async () => {
  const client = new LocalYashClient()
  await client.exec('mkdir docs'); await client.exec('touch docs/guide.md')
  expect(await client.complete('cat d')).toEqual(['docs'])
  expect(await client.complete('cat missing/g')).toEqual([])
  await client.close()
})

test('shell navigation delegates to the local node store', () => {
  const store = new NodeStore(); const shell = new Shell({ name: 'root' }, store)
  store.mkdir('/home/root/docs'); shell.cd('docs')
  expect(shell.pwd).toBe('/home/root/docs')
  expect(() => shell.cd('missing')).toThrow('No such directory')
})

test('fixture providers report missing paths and enumerate configured files', () => {
  const fixture = new FixtureProvider({ 'docs/guide.md': 'guide' })
  expect(fixture.list('docs')).toEqual(['guide.md'])
  expect(fixture.entries()).toEqual([['docs/guide.md', 'guide']])
  expect(() => fixture.read('missing')).toThrow('No such file: missing')
  expect(() => fixture.type('missing')).toThrow('No such file: missing')
})

test('the composed node store façade delegates every filesystem operation', () => {
  const store = new NodeStore(); store.mkdir('/home/root/lower'); store.mkdir('/home/root/upper')
  expect(store.origin.name).toBe('/'); expect(store.get('/home/root/lower', false, 0)?.dir).toBe(true)
  store.write('/home/root/lower/item', 'lower'); store.write('/home/root/upper/item', 'upper')
  store.union('/home/root/view', ['/home/root/upper', '/home/root/lower'])
  expect(store.getNode(1)?.name).toBe('/'); expect(store.read('/home/root/view/item')).toBe('upper')
  store.symlink('/home/root/lower/item', '/home/root/link'); expect(store.readlink('/home/root/link')).toContain('item')
  const snapshot = store.snapshot(9); store.removeTree('/home/root/link'); store.restore(snapshot)
  expect(store.type('/home/root/link')).toBe('file')
  store.apply({ type: 'touch', path: '/home/root/restored', at: new Date().toISOString() })
  store.validate([{ type: 'remove', path: '/home/root/restored', at: new Date().toISOString() }])
  expect(store.mounts()[0].path).toBe('/home/root/view')
})

test('path and framing helpers validate protocol input and normalize paths', () => {
  expect(PathResolver.home({ name: 'alice' })).toBe('/home/alice')
  expect(normalize('/home/./root/../alice')).toEqual(['home', 'alice'])
  expect(PathResolver.resolve('../docs/./guide', '/home/root/work')).toBe('/home/root/docs/guide')
  expect(PathResolver.resolve('/', '/home/root')).toBe('/')
  expect(() => parseRequest('{')).toThrow(); expect(requestFailure(new Error('no'))).toBeUndefined()
  expect(persistenceFailure(3, 'disk').error.code).toBe('persistence_error')
  const writes: string[] = []
  const socket = { destroyed: false, write: (value: string) => writes.push(value), on: () => undefined }
  respond(socket as never, { version: 1, id: 1, result: { stdout: '', stderr: '', status: 0, session: { user: 'root', cwd: '/' } } })
  attachLines(socket as never, () => undefined); expect(writes[0]).toContain('"id":1')
})

test('shell variables expose only explicit session state', () => {
  const yafs = new Yafs()
  expect(variable(yafs, 'USER')).toBe('root'); expect(variable(yafs, 'PWD')).toBe('/home/root')
  expect(variable(yafs, 'UNDECLARED')).toBe('')
})
