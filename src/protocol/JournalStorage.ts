import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function prepareJournal(path: string) {
  await mkdir(dirname(path), { recursive: true })
}

export async function acquireLock(path: string) {
  try { const file = await open(path, 'wx'); await file.writeFile(`${process.pid}\n`); await file.close() }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !await stale(path)) throw error; await unlink(path); return acquireLock(path) }
}

export async function appendAndSync(path: string, records: unknown[]) {
  const file = await open(path, 'a')
  await file.writeFile(records.map(record => JSON.stringify(record)).join('\n') + '\n')
  await file.sync(); await file.close()
}

export async function truncateAndSync(path: string) {
  const file = await open(path, 'w'); await file.sync(); await file.close()
}

export async function removeIfPresent(path: string) {
  try { await unlink(path) } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

export async function writeAtomically(path: string, data: string) {
  const temporary = `${path}.tmp`; const file = await open(temporary, 'w')
  await file.writeFile(data); await file.sync(); await file.close(); await rename(temporary, path)
  const directory = await open(dirname(path), 'r'); await directory.sync(); await directory.close()
}

async function stale(path: string): Promise<boolean> {
  const pid = Number((await readFile(path, 'utf8')).trim())
  try { process.kill(pid, 0); return false } catch { return true }
}
