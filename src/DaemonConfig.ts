import { resolve } from 'node:path'

export function configArgument(configPath?: string) { return configPath ? ['--config', configPath] : [] }

export function restartConfig(selected: string | undefined, state?: { configPath?: string }) {
  return selected || state?.configPath
}

export function selectedConfig(arguments_: string[], environment: NodeJS.ProcessEnv) {
  const index = arguments_.indexOf('--config'); const path = index >= 0 ? arguments_[index + 1] : environment.YAFS_CONFIG
  return path && resolve(path)
}
