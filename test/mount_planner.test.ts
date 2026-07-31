import { expect, test } from 'bun:test'

import Yafs from '../src'

test('mount planning rejects duplicate and overlapping active paths', () => {
  const yafs = new Yafs()
  yafs.store.write('/home/root/.yafsmeta', multipleFixtureManifest())
  expect(yafs.exec('mount activate .yafsmeta first')).toBe('first active')
  expect(yafs.execute('mount activate .yafsmeta second').stderr).toBe('Overlapping mount: /home/root/fixture/nested')
  expect(yafs.execute('mount activate .yafsmeta duplicate').stderr).toBe('Mount path already exists: /home/root/fixture')
})

function multipleFixtureManifest() {
  return '{version: 1, mounts: [{id: first, path: fixture, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}, {id: second, path: fixture/nested, provider: fixture, config: {files: {hello.txt: hello}}, capabilities: []}, {id: duplicate, path: fixture, provider: fixture, config: {files: {again.txt: hello}}, capabilities: []}]}'
}
