import { expect, test } from 'bun:test'

import { McpServer } from '../src/mcp/Server'
import { LocalYashClient } from '../src/protocol/local'

test('MCP exposes a narrow read and inspection bridge over Yafs', async () => {
  const client = new LocalYashClient(); await client.exec('mkdir work')
  await client.exec('echo concise > work/brief.md'); const server = new McpServer(client)
  expect(await request(server, 1, 'initialize')).toMatchObject({ result: { capabilities: { tools: {} } } })
  expect(await request(server, 2, 'tools/list')).toMatchObject({ result: { tools: expect.arrayContaining([
    expect.objectContaining({ name: 'yafs.list' }), expect.objectContaining({ name: 'yafs.read' }),
    expect.objectContaining({ name: 'yafs.inspect' }), expect.objectContaining({ name: 'yafs.query' })]) } })
  expect(text(await request(server, 3, 'tools/call', { name: 'yafs.read', arguments: { path: '/home/root/work/brief.md' } }))).toBe('concise')
  expect(text(await request(server, 4, 'tools/call', { name: 'yafs.inspect', arguments: { path: '/home/root/work/brief.md' } }))).toContain('"kind":"local"')
  expect(text(await request(server, 5, 'tools/call', { name: 'yafs.inspect', arguments: { path: '/' } }))).toContain('"type":"directory"')
  expect(text(await request(server, 6, 'tools/call', { name: 'yafs.read', arguments: { path: '../unsafe' } }))).toContain('absolute Yafs path')
  expect(text(await request(server, 7, 'tools/call', { name: 'yafs.query', arguments: { source: 'grep -n concise /home/root/work/brief.md' } }))).toBe('1:concise')
  expect(text(await request(server, 8, 'tools/call', { name: 'yafs.query', arguments: { source: 'mkdir unsafe' } }))).toContain('not read-only')
  expect(text(await request(server, 9, 'tools/call', { name: 'yafs.query', arguments: { source: 'echo nope > unsafe' } }))).toContain('not read-only')
  expect(text(await request(server, 10, 'tools/call', { name: 'yafs.query', arguments: { source: 'echo $(mkdir unsafe)' } }))).toContain('not read-only')
  expect(text(await request(server, 11, 'tools/call', { name: 'yafs.query', arguments: { source: 'cd work' } }))).toContain('not read-only')
  await client.close()
})

function request(server: McpServer, id: number, method: string, params?: unknown) {
  return server.receive({ jsonrpc: '2.0', id, method, params })
}

function text(response: Awaited<ReturnType<McpServer['receive']>>) {
  const result = response?.result as { content: { text: string }[] }
  return result.content[0].text
}
