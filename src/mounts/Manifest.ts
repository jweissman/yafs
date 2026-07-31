import { createHash } from 'node:crypto'
import { parseDocument } from 'yaml'

import { Manifest, ManifestMount } from './types'

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
  const mount = object(value, 'mount'); only(mount, ['id', 'path', 'provider', 'config', 'capabilities'], 'mount')
  validateMountFields(mount)
  return validatedMount(mount)
}

function validatedMount(mount: Record<string, unknown>): ManifestMount {
  return { id: mount.id as string, path: mount.path as string, provider: 'fixture',
    config: fixture(mount.config), capabilities: mount.capabilities as string[] }
}

function validateMountFields(mount: Record<string, unknown>) {
  if (typeof mount.id !== 'string' || !relative(mount.path) || mount.provider !== 'fixture') throw new Error('Invalid .yafsmeta mount')
  if (!Array.isArray(mount.capabilities) || !mount.capabilities.every(capability => typeof capability === 'string')) throw new Error('Invalid .yafsmeta capabilities')
}

function fixture(value: unknown) {
  const config = object(value, 'fixture config'); only(config, ['files'], 'fixture config'); const files = object(config.files, 'fixture files')
  if (!Object.entries(files).every(([path, content]) => relative(path) && typeof content === 'string')) throw new Error('Invalid fixture files')
  return { files: files as Record<string, string> }
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${name}`); return value as Record<string, unknown> }

function only(value: Record<string, unknown>, keys: string[], name: string) { if (Object.keys(value).some(key => !keys.includes(key))) throw new Error(`Unknown ${name} field`) }

function relative(value: unknown): value is string { return typeof value === 'string' && value !== '' && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..') }

function canonical(value: unknown) { return JSON.stringify(value) }
