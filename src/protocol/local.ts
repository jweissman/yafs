import Yafs from '../index'
import type { ExecutionResult } from '../types/ExecutionResult'

export class LocalYashClient {
  private readonly yafs = new Yafs()

  async execute(command: string): Promise<ExecutionResult> { return this.yafs.execute(command) }

  async exec(command: string): Promise<string> {
    const result = await this.execute(command)
    if (result.error) throw new Error(result.error.message)
    return result.stdout
  }

  async complete(input: string): Promise<string[]> {
    const target = completionTarget(input); const result = await this.execute(`ls ${target.directory}`); return result.error ? [] : result.stdout.split('\n').filter(name => name.startsWith(target.prefix)).map(target.format)
  }

  async close() {}
}

function completionTarget(input: string) {
  const token = input.trimEnd().split(/\s+/).at(-1) || ''; const slash = token.lastIndexOf('/'); const directory = slash === -1 ? '.' : (token.slice(0, slash) || '/'); const prefix = slash === -1 ? token : token.slice(slash + 1)
  return { directory, prefix, format: (name: string) => slash === -1 ? name : `${token.slice(0, slash + 1)}${name}` }
}
