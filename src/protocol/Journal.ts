import { createHash } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

import { VfsSnapshot } from '../vfs/Snapshot'
import { VfsOperation } from '../vfs/VfsOperation'
import { NodeStore } from '../vfs/NodeStore'

const VERSION = 1
const SNAPSHOT_INTERVAL = 32
type Record = { version: 1, sequence: number, operation: VfsOperation, checksum: string }
type StoredSnapshot = VfsSnapshot & { checksum: string }
type Replayer = (operation: VfsOperation) => void

export class Journal {
  private constructor(private readonly walPath: string, private readonly lockPath: string,
    private sequence: number) {}

  static async open(walPath: string, store: NodeStore, replay?: Replayer): Promise<Journal> {
    await mkdir(dirname(walPath), { recursive: true })
    const journal = await Journal.lock(walPath)
    return journal.restoreAndReturn(store, replay)
  }

  private async restoreAndReturn(store: NodeStore, replayOperation?: Replayer): Promise<Journal> {
    try { this.sequence = await this.restore(store, replayOperation); return this }
    catch (error) { await this.close(); throw error }
  }

  private static async lock(walPath: string): Promise<Journal> {
    const lockPath = `${walPath}.lock`; await acquireLock(lockPath); return new Journal(walPath, lockPath, 0)
  }

  async commit(operations: VfsOperation[]) {
    if (!operations.length) return
    await appendAndSync(this.walPath, this.records(operations))
    this.sequence += operations.length
  }

  private records(operations: VfsOperation[]) {
    return operations.map((operation, index) => this.record(operation, this.sequence + index + 1))
  }

  async compact(store: NodeStore) {
    if (this.sequence % SNAPSHOT_INTERVAL) return
    await writeSnapshot(this.snapshotPath(), store.snapshot(this.sequence))
    await truncateAndSync(this.walPath)
  }

  async close() { await ignoreMissing(() => unlink(this.lockPath)) }

  private record(operation: VfsOperation, sequence: number): Record {
    const record = { version: 1 as const, sequence, operation, checksum: '' }
    return { ...record, checksum: checksum({ version: record.version, sequence, operation }) }
  }

  private async restore(store: NodeStore, replayOperation?: Replayer): Promise<number> {
    const sequence = await restoreSnapshot(this.snapshotPath(), store)
    await discardTornFinalRecord(this.walPath)
    return replay(this.walPath, store, sequence, replayOperation)
  }

  private snapshotPath() { return `${this.walPath}.snapshot` }
}

async function acquireLock(path: string) {
  try { const file = await open(path, 'wx'); await file.writeFile(`${process.pid}\n`); await file.close() }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !await stale(path)) throw error; await unlink(path); return acquireLock(path) }
}

async function stale(path: string): Promise<boolean> {
  const pid = Number((await readFile(path, 'utf8')).trim()); try { process.kill(pid, 0); return false } catch { return true }
}

async function appendAndSync(path: string, records: Record[]) {
  const file = await open(path, 'a'); await file.writeFile(records.map(record => JSON.stringify(record)).join('\n') + '\n'); await file.sync(); await file.close()
}

async function truncateAndSync(path: string) {
  const file = await open(path, 'w'); await file.sync(); await file.close()
}

async function writeSnapshot(path: string, snapshot: VfsSnapshot) {
  const data = { ...snapshot, checksum: checksum(snapshot) }; const temporary = `${path}.tmp`
  const file = await open(temporary, 'w'); await file.writeFile(JSON.stringify(data)); await file.sync(); await file.close(); await rename(temporary, path); await syncDirectory(path)
}

async function syncDirectory(path: string) { const directory = await open(dirname(path), 'r'); await directory.sync(); await directory.close() }

async function restoreSnapshot(path: string, store: NodeStore): Promise<number> {
  try { const snapshot = JSON.parse(await readFile(path, 'utf8')) as StoredSnapshot; verifySnapshot(snapshot); store.restore(snapshot); return snapshot.sequence }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error }
}

async function replay(path: string, store: NodeStore, sequence: number,
  replayOperation?: Replayer): Promise<number> {
  try { return applyRecords(await readFile(path, 'utf8'), store, sequence, replayOperation) }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return sequence; throw error }
}

async function discardTornFinalRecord(path: string) {
  try { const data = await readFile(path, 'utf8'); if (!data || data.endsWith('\n')) return; const file = await open(path, 'r+'); await file.truncate(data.lastIndexOf('\n') + 1); await file.sync(); await file.close() }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

function applyRecords(data: string, store: NodeStore, sequence: number,
  replayOperation?: Replayer): number {
  const lines = data.split('\n'); const complete = data.endsWith('\n') ? lines.slice(0, -1) : lines.slice(0, -1)
  return applyCompleteRecords(complete, store, sequence, replayOperation)
}

function applyCompleteRecords(lines: string[], store: NodeStore, sequence: number,
  replayOperation?: Replayer) {
  return lines.filter(Boolean).reduce((current, line) =>
    applyRecord(line, store, current, replayOperation), sequence)
}

function applyRecord(line: string, store: NodeStore, sequence: number,
  replayOperation?: Replayer): number {
  try { return replayRecord(JSON.parse(line) as Record, store, sequence, replayOperation) }
  catch { throw new Error('Corrupt journal record') }
}

function replayRecord(record: Record, store: NodeStore, sequence: number,
  replayOperation?: Replayer) {
  verifyRecord(record, sequence + 1); store.apply(record.operation)
  replayOperation?.(record.operation); return record.sequence
}

function verifyRecord(record: Record, sequence: number) {
  if (record.version !== VERSION || record.sequence !== sequence || record.checksum !== checksum({ version: record.version, sequence: record.sequence, operation: record.operation })) throw new Error('Corrupt journal record')
}

function verifySnapshot(snapshot: StoredSnapshot) {
  if (snapshot.version !== VERSION || snapshot.checksum !== checksum({ version: snapshot.version, sequence: snapshot.sequence, root: snapshot.root })) throw new Error('Corrupt snapshot')
}

function checksum(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }

async function ignoreMissing(action: () => Promise<void>) {
  try { await action() } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
