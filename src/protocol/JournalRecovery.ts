import { createHash } from 'node:crypto'
import { open, readFile } from 'node:fs/promises'

import { VfsSnapshot } from '../vfs/Snapshot'
import { NodeStore } from '../vfs/NodeStore'
import { writeAtomically } from './JournalStorage'
import { JournalRecord, JournalReplayer } from './JournalTypes'

const VERSION = 1
type StoredSnapshot = VfsSnapshot & { checksum: string }

export async function restoreJournal(wal: string, snapshot: string, store: NodeStore,
  replayer?: JournalReplayer): Promise<number> {
  const sequence = await restoreSnapshot(snapshot, store); await discardTornFinalRecord(wal)
  return replay(wal, store, sequence, replayer)
}

export async function writeSnapshot(path: string, snapshot: VfsSnapshot) {
  await writeAtomically(path, JSON.stringify({ ...snapshot, checksum: checksum(snapshot) }))
}

async function restoreSnapshot(path: string, store: NodeStore): Promise<number> {
  try { const snapshot = JSON.parse(await readFile(path, 'utf8')) as StoredSnapshot; verifySnapshot(snapshot); store.restore(snapshot); return snapshot.sequence }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error }
}

async function replay(path: string, store: NodeStore, sequence: number,
  replayer?: JournalReplayer) {
  try { return applyRecords(await readFile(path, 'utf8'), store, sequence, replayer) }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return sequence; throw error }
}

async function discardTornFinalRecord(path: string) {
  try { const data = await readFile(path, 'utf8'); if (!data || data.endsWith('\n')) return; const file = await open(path, 'r+'); await file.truncate(data.lastIndexOf('\n') + 1); await file.sync(); await file.close() }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

function applyRecords(data: string, store: NodeStore, sequence: number,
  replayer?: JournalReplayer) {
  return data.split('\n').slice(0, -1).filter(Boolean).reduce((current, line) =>
    applyRecord(line, store, current, replayer), sequence)
}

function applyRecord(line: string, store: NodeStore, sequence: number,
  replayer?: JournalReplayer) {
  try { return replayRecord(JSON.parse(line) as JournalRecord, store, sequence, replayer) }
  catch { throw new Error('Corrupt journal record') }
}

function replayRecord(record: JournalRecord, store: NodeStore, sequence: number,
  replayer?: JournalReplayer) {
  verifyRecord(record); if (record.sequence <= sequence) return sequence
  return applyNext(record, store, sequence, replayer)
}

function applyNext(record: JournalRecord, store: NodeStore, sequence: number,
  replayer?: JournalReplayer) {
  if (record.sequence !== sequence + 1) throw new Error('Corrupt journal record')
  store.apply(record.operation); replayer?.(record.operation); return record.sequence
}

function verifyRecord(record: JournalRecord) {
  if (record.version !== VERSION || record.checksum !== checksum(data(record))) throw new Error('Corrupt journal record')
}

function data(record: JournalRecord) {
  return { version: record.version, sequence: record.sequence, operation: record.operation }
}

function verifySnapshot(snapshot: StoredSnapshot) {
  if (snapshot.version !== VERSION || snapshot.checksum !== checksum(snapshotData(snapshot))) throw new Error('Corrupt snapshot')
}

function snapshotData(snapshot: StoredSnapshot) {
  return { version: snapshot.version, sequence: snapshot.sequence, root: snapshot.root }
}

function checksum(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
