import { createHash } from 'node:crypto'

import { AbsolutePath } from '../core/AbsolutePath'
import { PathResolver } from '../core/PathResolver'
import { Provenance } from '../mounts/types'
import { BlobStore } from '../protocol/BlobStore'

export type TraceEntry = { path: string, digest: string }
export type Trace = { kind: 'yafs-trace', version: 1, sourcePath: string, capturedAt: string, origin?: Provenance, resourceReference?: object,
  entries: TraceEntry[] }
export type TraceFilesystem = {
  exists(path: AbsolutePath): boolean, type(path: AbsolutePath): 'file' | 'directory' | 'symlink',
  list(path: AbsolutePath): string[], read(path: AbsolutePath): string,
  mkdir(path: AbsolutePath): void, write(path: AbsolutePath, content: string): void
}
export type TraceReifier = { reify(trace: Trace, digest: string): Promise<Uint8Array | undefined> }

export class TraceService {
  constructor(private readonly blobs: BlobStore, private readonly reifier?: TraceReifier) {}

  async capture(files: TraceFilesystem, source: AbsolutePath, origin?: Provenance,
    capturedAt = new Date().toISOString()): Promise<Trace> {
    if (files.type(source) !== 'directory') throw new Error('Trace source must be a directory')
    return { kind: 'yafs-trace', version: 1, sourcePath: source, capturedAt, origin, entries: await this.entries(files, source, '') }
  }

  async materialize(files: TraceFilesystem, trace: Trace, destination: AbsolutePath) {
    if (files.exists(destination)) throw new Error(`Trace destination already exists: ${destination}`)
    files.mkdir(destination); for (const entry of trace.entries) await this.write(files, trace, destination, entry)
  }

  retain(trace: Trace, owner: string) { trace.entries.forEach(entry => this.blobs.retain(entry.digest, owner)) }
  release(trace: Trace, owner: string) { trace.entries.forEach(entry => this.blobs.release(entry.digest, owner)) }
  gc() { return this.blobs.gc() }

  parse(content: string): Trace {
    const trace = JSON.parse(content) as Trace
    this.assertManifest(trace)
    trace.entries.forEach(entry => this.assertEntry(entry)); return trace
  }
  private assertManifest(trace: Trace) {
    if (trace.kind !== 'yafs-trace' || trace.version !== 1 || !Array.isArray(trace.entries) || !trace.capturedAt) throw new Error('Invalid trace manifest')
  }

  private async entries(files: TraceFilesystem, path: AbsolutePath, relative: string): Promise<TraceEntry[]> {
    if (files.type(path) === 'file') return [await this.entry(files, path, relative)]
    return (await Promise.all(files.list(path).map(name => this.child(files, path, relative, name)))).flat()
  }
  private child(files: TraceFilesystem, path: AbsolutePath, relative: string, name: string) {
    return this.entries(files, PathResolver.resolve(name, path), join(relative, name))
  }
  private async entry(files: TraceFilesystem, path: AbsolutePath, relative: string) {
    const bytes = new TextEncoder().encode(files.read(path))
    return { path: relative, digest: await this.blobs.put(bytes) }
  }
  private async write(files: TraceFilesystem, trace: Trace, destination: AbsolutePath, entry: TraceEntry) {
    this.assertEntry(entry); const path = this.destination(destination, entry.path)
    const content = new TextDecoder().decode(await this.bytes(trace, entry.digest))
    this.parents(files, destination, path); files.write(path, content)
  }
  private async bytes(trace: Trace, digest: string) {
    return await this.blobs.get(digest) || this.recover(trace, digest)
  }
  private async recover(trace: Trace, digest: string) {
    if (!trace.resourceReference || !this.reifier) throw new Error(`Missing trace blob: ${digest}`)
    const bytes = await this.recoverBytes(trace, digest)
    return this.saveRecovered(bytes, digest)
  }
  private async saveRecovered(bytes: Uint8Array, digest: string) {
    this.assertRecoveredDigest(await this.blobs.put(bytes), digest); return bytes
  }
  private async recoverBytes(trace: Trace, digest: string) {
    const bytes = await this.reifier?.reify(trace, digest)
    if (!bytes) throw new Error(`Missing trace blob: ${digest}`)
    return bytes
  }
  private assertRecoveredDigest(actual: string, expected: string) {
    if (actual !== expected) throw new Error(`Trace reifier returned wrong content: ${expected}`)
  }
  private destination(destination: AbsolutePath, relative: string) {
    this.assertPath(relative); return PathResolver.resolve(relative, destination)
  }
  private parents(files: TraceFilesystem, root: AbsolutePath, path: AbsolutePath) {
    path.slice(root.length + 1).split('/').slice(0, -1)
      .reduce<AbsolutePath>((parent, name) => this.parent(files, parent, name), root)
  }
  private parent(files: TraceFilesystem, parent: AbsolutePath, name: string) {
    const path = PathResolver.resolve(name, parent); if (!files.exists(path)) files.mkdir(path); return path
  }
  private assertEntry(entry: TraceEntry) { this.assertPath(entry.path); assertDigest(entry.digest) }
  private assertPath(path: string) {
    if (!path || path.startsWith('/') || path.split('/').some(invalidPart)) throw new Error(`Invalid trace entry path: ${path}`)
  }
}

function join(parent: string, name: string) { return parent ? `${parent}/${name}` : name }
function invalidPart(part: string) { return !part || part === '.' || part === '..' }
function assertDigest(value: string) { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid trace digest') }
export function digest(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex') }
