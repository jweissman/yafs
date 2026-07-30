import { YafsServer } from './protocol/server'

const port = Number(process.env.YAFS_PORT || 7337)
const host = process.env.YAFS_HOST || '127.0.0.1'
const walPath = process.env.YAFS_WAL || 'yafs.wal'
const server = await YafsServer.start({ host, port, walPath })

console.log(`yafsd listening on ${host}:${server.address().port}; journal: ${walPath}`)

await new Promise<void>(resolve => {
  process.once('SIGINT', resolve)
  process.once('SIGTERM', resolve)
})
await server.close()
