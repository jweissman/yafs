import { createInterface } from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { YashClient } from './protocol/client'
import { CommandHistory } from './yash/history'
import { completionToken } from './yash/completion'
import { renderPrompt } from './yash/prompt'

const host = process.env.YAFS_HOST || '127.0.0.1'
const port = Number(process.env.YAFS_PORT || 7337)
const args = process.argv.slice(2)
const json = args[0] === '--json'
if (json) args.shift()
const command = args[0] === '-c' ? args.slice(1).join(' ') : args.join(' ')
const promptTemplate = process.env.PROMPT || '{user}@{server}:{cwd}$ '
const historyPath = process.env.YAFS_HISTORY || join(homedir(), '.local', 'state', 'yafs', 'history')
const client = await YashClient.connect({ host, port })

try {
  if (command) {
    const result = await client.execute(command)
    if (json) console.log(JSON.stringify(result))
    else {
      print(result.stdout)
      if (result.stderr) console.error(result.stderr)
      process.exitCode = result.status
    }
  } else {
    const readline = createInterface({
      input: stdin,
      output: stdout,
      completer: async line => [await client.complete(line), completionToken(line)]
    })
    const history = await CommandHistory.open(historyPath)
    readline.history = [...history.entries()].reverse()
    readline.on('SIGINT', () => readline.close())
    installReverseSearch(readline, history)
    let session = (await client.execute('pwd')).session
    while (true) {
      const line = await readline.question(renderPrompt(promptTemplate, session, host))
      if (line === 'exit' || line === 'quit') break
      if (line === 'history') {
        history.entries().forEach((entry, index) => console.log(`${index + 1}  ${entry}`))
        continue
      }
      try {
        await history.record(line)
        const result = await client.execute(line)
        session = result.session
        print(result.stdout)
        if (result.stderr) console.error(result.stderr)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
      }
    }
    readline.close()
  }
} finally {
  await client.close()
}

function print(output: string) {
  if (output) console.log(output)
}

function installReverseSearch(readline: ReturnType<typeof createInterface>, history: CommandHistory) {
  if (!stdin.isTTY) return
  emitKeypressEvents(stdin)
  stdin.on('keypress', (_text, key) => {
    if (key?.ctrl && key.name === 'r') replaceLine(readline, history.search(readline.line))
  })
}

function replaceLine(readline: ReturnType<typeof createInterface>, line: string | undefined) {
  if (!line) return
  readline.write(null, { ctrl: true, name: 'u' })
  readline.write(line)
}
