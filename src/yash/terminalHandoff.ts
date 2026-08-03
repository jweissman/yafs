import { stdin } from 'node:process'
import type { createInterface } from 'node:readline/promises'

type Readline = ReturnType<typeof createInterface>

export async function withTerminalHandoff<T>(readline: Readline, action: () => Promise<T>): Promise<T> {
  release(readline)
  try { return await action() } finally { reclaim(readline) }
}

function release(readline: Readline) {
  readline.pause(); if (stdin.isTTY) stdin.setRawMode(false); stdin.pause()
}

function reclaim(readline: Readline) {
  stdin.resume(); if (stdin.isTTY) stdin.setRawMode(true); readline.resume()
}
