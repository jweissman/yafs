import { expect, test } from 'bun:test'

import Yafs from '../src'
import { commandPath } from '../src/commands/commandPath'
import { CommandContext } from '../src/commands/CommandContext'

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

function commandContext(): CommandContext {
  const resolve = (path: string) => `/home/root/${path}` as const
  return { clock: { now: () => new Date(0) }, user: () => 'root', pwd: () => '/home/root', cd: () => undefined, resolve,
    required: (_command, args, index) => args[index] || '', help: () => '', read: () => '', readlink: () => '', list: () => [], type: () => 'file', origins: () => [], provenance: () => [], mounts: () => [], planMount: () => { throw new Error() }, planUnmount: () => { throw new Error() }, mkdir: () => undefined, touch: () => undefined, remove: () => undefined, symlink: () => undefined, union: () => undefined, mount: () => undefined, unmount: () => undefined }
}
