import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export type DaemonState = {
  version: 1, pid: number, host: string, port: number, startedAt: string, instanceId: string
}

export function paths(dataDir: string) {
  const directory = resolve(dataDir)
  return { directory, state: `${directory}/daemon.json`, log: `${directory}/daemon.log` }
}

export async function readState(path: string): Promise<DaemonState | undefined> {
  try { return validate(JSON.parse(await readFile(path, 'utf8'))) }
  catch (error: unknown) { return absentState(error) }
}

export async function writeState(path: string, address: { host: string, port: number }) {
  const state = newState(address)
  await replace(path, `${path}.${state.instanceId}.tmp`, JSON.stringify(state))
  return state
}

export async function clearState(path: string) { await ignoreMissing(() => unlink(path)) }

export function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function currentState(path: string): Promise<DaemonState | undefined> {
  const state = await readState(path)
  if (!state || isRunning(state.pid)) return state
  return removeStaleState(path)
}

async function removeStaleState(path: string) { await clearState(path); return undefined }

function newState(address: { host: string, port: number }): DaemonState {
  return { version: 1, pid: process.pid, ...address, startedAt: new Date().toISOString(),
    instanceId: randomUUID() }
}

async function replace(path: string, temporary: string, contents: string) {
  await mkdir(dirname(path), { recursive: true }); await writeFile(temporary, contents)
  await rename(temporary, path); await syncDirectory(path)
}

function validate(value: unknown): DaemonState {
  if (!value || typeof value !== 'object') throw new Error('Invalid daemon state')
  const state = value as DaemonState
  return validState(state) ? state : invalidState()
}

function invalidState(): never { throw new Error('Invalid daemon state') }

function validState(state: DaemonState) {
  return state.version === 1 && Number.isInteger(state.pid) && typeof state.host === 'string'
    && Number.isInteger(state.port) && typeof state.startedAt === 'string' && typeof state.instanceId === 'string'
}

function absentState(error: unknown): undefined {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
  throw error
}

async function ignoreMissing(action: () => Promise<void>) {
  try { await action() } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

async function syncDirectory(path: string) { const directory = await open(dirname(path), 'r'); await directory.sync(); await directory.close() }
