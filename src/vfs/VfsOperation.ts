import { AbsolutePath } from '../core/AbsolutePath'
import { PreparedMountRecord } from '../mounts/types'

type TimedOperation = { at: string }

export type VfsIntent =
  { type: 'mkdir', path: AbsolutePath } |
  { type: 'touch', path: AbsolutePath } |
  { type: 'write', path: AbsolutePath, content: string } |
  { type: 'symlink', path: AbsolutePath, target: string } |
  { type: 'union', path: AbsolutePath, layers: AbsolutePath[] } |
  { type: 'mount', record: PreparedMountRecord } |
  { type: 'refresh', record: PreparedMountRecord } |
  { type: 'unmount', id: string } |
  { type: 'remove', path: AbsolutePath } |
  { type: 'rmdir', path: AbsolutePath }

export type VfsOperation = TimedOperation & (
  { type: 'mkdir', path: AbsolutePath } |
  { type: 'touch', path: AbsolutePath } |
  { type: 'write', path: AbsolutePath, content: string } |
  { type: 'symlink', path: AbsolutePath, target: string } |
  { type: 'union', path: AbsolutePath, layers: AbsolutePath[] } |
  { type: 'mount', record: PreparedMountRecord } |
  { type: 'refresh', record: PreparedMountRecord } |
  { type: 'unmount', id: string } |
  { type: 'remove', path: AbsolutePath } |
  { type: 'rmdir', path: AbsolutePath }
)
