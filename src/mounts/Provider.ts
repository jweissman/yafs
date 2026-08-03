import { FixtureProvider } from './FixtureProvider'
import { MountRecord } from './types'

export type ReadOnlyProvider = {
  read(path: string): string
  list(path: string): string[]
  type(path: string): 'file' | 'directory'
  entries(): [string, string][]
}

export function providerFor(record: MountRecord): ReadOnlyProvider {
  if (record.provider !== 'fixture') throw new Error(`Provider is not synchronous: ${record.provider}`)
  return FixtureProvider.from(record.config as import('./types').FixtureConfig)
}
