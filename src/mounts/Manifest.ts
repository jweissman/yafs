import { createHash } from 'node:crypto'
import { parseDocument } from 'yaml'

import { Manifest, ManifestMount } from './types'
import { fixtureStreams } from './FixtureStreamManifest'
import { object, only, relative } from './ManifestValidation'

type YamlDocument = ReturnType<typeof parseDocument>
type YamlNode = {
  anchor?: unknown, tag?: unknown, items?: unknown[], key?: unknown, value?: unknown
}

export function parseManifest(source: string): { manifest: Manifest, digest: string } {
  const manifest = validateManifest(decoded(source))
  return { manifest, digest: createHash('sha256').update(canonical(manifest)).digest('hex') }
}

function decoded(source: string) {
  const document = parseDocument(source, { schema: 'core', uniqueKeys: true, merge: false })
  if (document.errors.length || document.warnings.length) throw new Error('Invalid .yafsmeta YAML')
  return documentValue(document)
}

function documentValue(document: YamlDocument) {
  assertPlainNodes(document.contents)
  try { return document.toJS({ maxAliasCount: 0 }) }
  catch { throw new Error('Invalid .yafsmeta YAML') }
}

function assertPlainNodes(node: unknown) {
  if (!node || typeof node !== 'object') return
  const value = node as YamlNode; if (value.anchor || value.tag) throw new Error('Invalid .yafsmeta YAML')
  assertChildren(value)
}

function assertChildren(node: YamlNode) {
  node.items?.forEach(assertPlainNodes)
  assertPlainNodes(node.key)
  assertPlainNodes(node.value)
}

function validateManifest(value: unknown): Manifest {
  const root = object(value, 'manifest'); only(root, ['version', 'mounts'], 'manifest')
  if (root.version !== 1 || !Array.isArray(root.mounts)) throw new Error('Invalid .yafsmeta manifest')
  return { version: 1, mounts: root.mounts.map(validateMount) }
}

function validateMount(value: unknown): ManifestMount {
  const mount = object(value, 'mount'); only(mount, ['id', 'path', 'provider', 'config', 'capabilities', 'refresh'], 'mount')
  validateMountFields(mount)
  return validatedMount(mount)
}

function validatedMount(mount: Record<string, unknown>): ManifestMount {
  const provider = mount.provider as ManifestMount['provider']
  return { ...mountIdentity(mount, provider), config: config(provider, mount.config),
    capabilities: mount.capabilities as string[], refreshIntervalMs: interval(mount.refresh) }
}

function mountIdentity(mount: Record<string, unknown>, provider: ManifestMount['provider']) {
  return { id: mount.id as string, path: mount.path as string, provider }
}

function config(provider: ManifestMount['provider'], value: unknown) { return provider === 'fixture' ? fixture(value) : github(value) }

function validateMountFields(mount: Record<string, unknown>) {
  if (typeof mount.id !== 'string' || !relative(mount.path) || !provider(mount.provider)) throw new Error('Invalid .yafsmeta mount')
  if (!Array.isArray(mount.capabilities) || !mount.capabilities.every(capability => typeof capability === 'string')) throw new Error('Invalid .yafsmeta capabilities')
}

function fixture(value: unknown) {
  const config = object(value, 'fixture config'); only(config, ['files', 'streams'], 'fixture config')
  const files = validFixtureFiles(config.files)
  return { files, streams: fixtureStreams(config.streams) }
}

function validFixtureFiles(value: unknown) {
  const files = object(value, 'fixture files')
  const valid = Object.entries(files).every(entry => relative(entry[0]) && typeof entry[1] === 'string')
  if (!valid) throw new Error('Invalid fixture files'); return files as Record<string, string>
}

function github(value: unknown) {
  const config = object(value, 'github config'); only(config, ['repository', 'query', 'max'], 'github config')
  return githubConfig(config)
}

function githubConfig(config: Record<string, unknown>) {
  const max = config.max; if (!validGitHubConfig(config.repository, config.query, max)) throw new Error('Invalid github config')
  return { repository: config.repository as string, query: config.query as string, max: max as number }
}

function validGitHubConfig(repositoryValue: unknown, query: unknown, max: unknown) {
  return repository(repositoryValue) && typeof query === 'string' && Number.isInteger(max)
    && typeof max === 'number' && max >= 1 && max <= 100
}

function provider(value: unknown): value is ManifestMount['provider'] { return value === 'fixture' || value === 'github' }

function repository(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) }

function interval(value: unknown) {
  if (value === undefined) return undefined
  const refresh = object(value, 'refresh'); only(refresh, ['interval'], 'refresh'); return intervalValue(refresh.interval)
}

function intervalValue(value: unknown) {
  if (typeof value !== 'string') throw new Error('Invalid refresh interval')
  const match = /^(\d+)(m|h)$/.exec(value); if (!match) throw new Error('Invalid refresh interval')
  return Number(match[1]) * (match[2] === 'h' ? 60 : 1) * 60_000
}

function canonical(value: unknown) { return JSON.stringify(value) }
