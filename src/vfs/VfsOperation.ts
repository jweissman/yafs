import { AbsolutePath } from '../core/AbsolutePath'
import { MountRecord } from '../mounts/types'

type TimedOperation = { at: string }

export type VfsIntent =
  { type: 'mkdir', path: AbsolutePath } |
  { type: 'touch', path: AbsolutePath } |
  { type: 'write', path: AbsolutePath, content: string } |
  { type: 'symlink', path: AbsolutePath, target: string } |
  { type: 'union', path: AbsolutePath, layers: AbsolutePath[] } |
  { type: 'mount', record: MountRecord } |
  { type: 'unmount', id: string } |
  { type: 'remove', path: AbsolutePath }

export type VfsOperation = TimedOperation & (
  { type: 'mkdir', path: AbsolutePath } |
  { type: 'touch', path: AbsolutePath } |
  { type: 'write', path: AbsolutePath, content: string } |
  { type: 'symlink', path: AbsolutePath, target: string } |
  { type: 'union', path: AbsolutePath, layers: AbsolutePath[] } |
  { type: 'mount', record: MountRecord } |
  { type: 'unmount', id: string } |
  { type: 'remove', path: AbsolutePath }
)
