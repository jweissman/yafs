import { Shell } from './Shell'
import { AbsolutePath } from './core/AbsolutePath'
import { MountManager } from './mounts/MountManager'
import { MountRecord, Provenance } from './mounts/types'
import { NodeStore } from './vfs/NodeStore'

export class YafsWorkspace {
  constructor(private readonly shell: Shell, private readonly store: NodeStore,
    private readonly mounts: MountManager) {}

  cd(path: string) {
    const absolute = this.shell.resolve(path)
    if (this.type(absolute) !== 'directory') throw new Error(`No such directory: ${absolute}`)
    this.shell.enter(absolute)
  }

  read(path: AbsolutePath) { return this.mounts.read(path) ?? this.store.read(path) }
  readlink(path: AbsolutePath) {
    return this.mounts.type(path) ? this.notLink(path) : this.store.readlink(path)
  }

  list(path: AbsolutePath) {
    return this.mounts.type(path) ? this.mounts.list(path, [])
      : this.mounts.list(path, this.store.list(path))
  }

  type(path: AbsolutePath, follow = true): 'file' | 'directory' | 'symlink' {
    return this.mounts.type(path) || this.store.type(path, follow)
  }

  origins(path: AbsolutePath) { return this.provenance(path).map(origin => origin.path) }

  provenance(path: AbsolutePath): Provenance[] {
    return this.mounts.provenance(path) || this.localProvenance(path)
  }

  mountLines() { return [...this.unionLines(), ...this.providerLines()] }

  private notLink(path: AbsolutePath): never { throw new Error(`Not a symbolic link: ${path}`) }

  private localProvenance(path: AbsolutePath) {
    return this.store.origins(path).map(origin => this.providerOrLocal(origin as AbsolutePath))
  }

  private providerOrLocal(path: AbsolutePath): Provenance {
    return this.mounts.provenance(path)?.[0] || { kind: 'local', path }
  }

  private unionLines() { return this.store.mounts().map(mount => this.unionLine(mount)) }
  private unionLine(mount: { path: string, layers: string[] }) { return `${mount.path} union ${mount.layers.join(' ')}` }
  private providerLines() { return this.mounts.mounts().map(mount => this.providerLine(mount)) }
  private providerLine(mount: MountRecord) { return `${mount.path} ${mount.provider} ${mount.state}` }
}
