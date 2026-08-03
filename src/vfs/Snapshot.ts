import { ProviderOrigin } from './FSNode'
import { AbsolutePath } from '../core/AbsolutePath'

export type SnapshotNode = {
  name: string
  dir?: boolean
  content?: string
  symlinkTarget?: string
  createdAt: string
  modifiedAt: string
  children?: SnapshotNode[]
  unionLayers?: AbsolutePath[]
  providerOrigin?: ProviderOrigin
}

export type VfsSnapshot = { version: 1, sequence: number, root: SnapshotNode }
