import type Yafs from './index'

export function variable(yafs: Yafs, name: string): string {
  if (name === 'USER') return yafs.user.name
  if (name === 'PWD') return yafs.shell.pwd
  return ''
}
