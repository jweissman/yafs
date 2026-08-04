import { expect, test } from 'bun:test'

import Yafs from '../src'
import { commandPath } from '../src/commands/commandPath'
import { CommandContext } from '../src/commands/CommandContext'
import { memoryBlobStore } from '../src/protocol/MemoryBlobStore'
import { TraceService } from '../src/traces/TraceService'

test('command helpers resolve required paths without executing a command', () => {
  expect(commandPath(commandContext(), ['note'], 'touch')).toBe('/home/root/note')
})

test('session command objects provide the standard session commands', () => {
  const yafs = new Yafs()
  expect(yafs.exec('help')).toContain('pwd'); expect(yafs.exec('version')).toContain('yafs')
  expect(yafs.exec('whoami')).toBe('root'); expect(yafs.exec('date')).toContain('T')
  expect(yafs.exec('true')).toBe(''); expect(yafs.execute('false').status).toBe(1)
  expect(yafs.exec('echo hello')).toBe('hello'); expect(yafs.exec('printf hello')).toBe('hello')
  expect(yafs.exec('pwd')).toBe('/home/root'); yafs.exec('mkdir next'); expect(yafs.exec('cd next')).toBe('')
})

test('read-only text commands query virtual files without host processes', () => {
  const yafs = new Yafs(); yafs.store.write('/home/root/words', 'alpha\nbeta\nalphabet')
  expect(yafs.exec('grep -n alpha words')).toBe('1:alpha\n3:alphabet')
  expect(yafs.exec('head -n 2 words')).toBe('alpha\nbeta')
  expect(yafs.exec('tail -n 1 words')).toBe('alphabet')
  expect(yafs.exec('wc -l words')).toBe('3')
  expect(yafs.exec('grep beta words')).toBe('beta')
  expect(yafs.execute('head words').stderr).toContain('head requires -n COUNT PATH')
  expect(yafs.execute('grep alpha').stderr).toContain('grep requires a pattern and path')
})

function commandContext(): CommandContext {
  const resolve = (path: string) => `/home/root/${path}` as const
  return { clock: { now: () => new Date(0) }, user: () => 'root', pwd: () => '/home/root', cd: () => undefined, resolve,
    required: (_command, args, index) => args[index] || '', help: () => '', read: () => '', readlink: () => '', list: () => [], type: () => 'file', origins: () => [], provenance: () => [], mounts: () => [], ...mountContext(), ...writeContext() }
}

function mountContext() {
  return { planMount: () => { throw new Error() }, prepareMount: () => { throw new Error() },
    planRefresh: () => { throw new Error() }, planUnmount: () => { throw new Error() },
    mount: () => undefined, refresh: () => undefined, unmount: () => undefined, resourceReference: () => undefined }
}

function writeContext() {
  return { exists: () => false, traces: new TraceService(memoryBlobStore()), mkdir: () => undefined,
    afterCommit: () => undefined, touch: () => undefined, write: () => undefined, remove: () => undefined,
    symlink: () => undefined, union: () => undefined }
}
