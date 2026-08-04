import { mkdir, open, readFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'

import { clearState, currentState, paths, writeState } from './daemon'
import { YashClient } from './protocol/client'
import { YafsServer } from './protocol/server'

const command = process.argv[2] || 'serve'
const settings = { host: process.env.YAFS_HOST || '127.0.0.1', port: Number(process.env.YAFS_PORT || 7337), dataDir: process.env.YAFS_DATA_DIR || '.yafs' }
const statePaths = paths(settings.dataDir)

await ({ serve, start, stop, restart, status }[command] || usage)()

async function serve() {
  if (await managedState()) throw new Error(`yafsd already running for ${statePaths.directory}`)
  const server = await startServer(); const state = await announce(server)
  await waitForSignal(); await server.close(); await clearState(statePaths.state, state.instanceId)
}

async function startServer() {
  try { return await YafsServer.start(settings) }
  catch (error) { throw isAddressInUse(error) ? addressInUseError() : error }
}

function isAddressInUse(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EADDRINUSE')
}

function addressInUseError() {
  return new Error(`Port ${settings.host}:${settings.port} is already in use; another yafsd `
    + '(perhaps a different data directory, or one started outside this lifecycle) may already be listening')
}

async function announce(server: YafsServer) {
  const address = server.address(); const state = await writeState(statePaths.state, address)
  console.log(`yafsd listening on ${address.host}:${address.port}; data: ${statePaths.directory}`); return state
}

async function start() {
  if (await managedState()) return report('running')
  const child = await launch()
  await waitForState(child); report('started')
}

async function launch() { await mkdir(statePaths.directory, { recursive: true }); return detach(await open(statePaths.log, 'a')) }

function detach(log: Awaited<ReturnType<typeof open>>) {
  const child = spawn(process.execPath, [import.meta.path, 'serve'], { detached: true, stdio: ['ignore', log.fd, log.fd], env: process.env }); child.unref(); void log.close(); return child
}

async function stop() {
  const state = await managedState(); if (!state) return report('stopped')
  process.kill(state.pid, 'SIGTERM'); await waitForStop(state.pid); await clearState(statePaths.state, state.instanceId); report('stopped')
}

async function restart() { await stop(); await start() }

async function status() { report(await managedState() ? 'running' : 'stopped') }

function usage(): never { throw new Error('Usage: yafsd [serve|start|stop|restart|status]') }

function report(value: string) { console.log(`yafsd ${value}; data: ${statePaths.directory}`) }

async function waitForState(child: ChildProcess) {
  for (let count = 0; count < 30; count++) { if (await tick(child)) return; await delay(100) }
  throw new Error(`Timed out starting yafsd; see ${statePaths.log}`)
}

async function tick(child: ChildProcess) {
  if (await currentState(statePaths.state)) return true
  if (child.exitCode !== null) throw await startupFailure(); return false
}

async function startupFailure() {
  return new Error((await errorLine()) || `yafsd failed to start; see ${statePaths.log}`)
}

async function errorLine() {
  try { return lastError(await readFile(statePaths.log, 'utf8')) } catch { return undefined }
}

function lastError(content: string) {
  const line = [...content.trim().split('\n')].reverse().find(entry => entry.startsWith('error:'))
  return line && `yafsd failed to start: ${line.slice('error:'.length).trim()}`
}

async function managedState() {
  const state = await currentState(statePaths.state)
  if (!state || await responds(state)) return state
  throw new Error(`Recorded yafsd PID ${state.pid} is live but its endpoint is unavailable; refuse to signal it`)
}

async function responds(state: { host: string, port: number }) {
  for (let i = 0; i < 3; i++) { if (await probe(state)) return true; if (i < 2) await pause() }
  return false
}

function pause() { return delay(150) }

async function probe(state: { host: string, port: number }) {
  try { const client = await YashClient.connect(state); await client.exec('version'); await client.close(); return true } catch { return false }
}

async function waitForStop(pid: number) { await waitUntil(() => !currentState(statePaths.state) || !processAlive(pid), 'Timed out stopping yafsd') }

async function waitUntil(check: () => Promise<unknown> | unknown, message: string) {
  for (let count = 0; count < 30; count++) { if (await check()) return; await delay(100) }
  throw new Error(message)
}

function processAlive(pid: number) {
  try { process.kill(pid, 0); return true }
  catch { return false }
}

function delay(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function waitForSignal() { return new Promise<void>(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve) }) }
