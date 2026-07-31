export type SnapshotNode = {
  name: string
  dir?: boolean
  content?: string
  symlinkTarget?: string
  createdAt: string
  modifiedAt: string
  children?: SnapshotNode[]
  unionLayers?: string[]
}

export type VfsSnapshot = { version: 1, sequence: number, root: SnapshotNode }
