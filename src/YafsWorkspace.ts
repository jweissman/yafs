import { Shell } from "./Shell";
import { AbsolutePath } from "./core/AbsolutePath";
import { MountRecord, Provenance } from "./mounts/types";
import { pluginByName } from "./mounts/ManifestMountPath";
import { NodeStore } from "./vfs/NodeStore";

export class YafsWorkspace {
  constructor(
    private readonly shell: Shell,
    private readonly store: NodeStore,
    private readonly mounts: () => MountRecord[],
  ) {}

  enter(path: AbsolutePath) {
    this.shell.enter(path);
  }

  read(path: AbsolutePath) {
    return this.store.read(path);
  }
  exists(path: AbsolutePath) {
    return !!this.store.get(path, false);
  }
  readlink(path: AbsolutePath) {
    return this.store.readlink(path);
  }
  list(path: AbsolutePath) {
    return this.store.list(path);
  }
  type(path: AbsolutePath, follow = true): "file" | "directory" | "symlink" {
    return this.store.type(path, follow);
  }

  origins(path: AbsolutePath) {
    return this.provenance(path).map((origin) => origin.path);
  }

  provenance(path: AbsolutePath): Provenance[] {
    return this.store.provenance(path).map((item) => this.provenanceItem(item));
  }

  mountLines() {
    return [...this.unionLines(), ...this.providerLines()];
  }

  mountSummaries() {
    return this.mounts().map((mount) => ({
      path: mount.path,
      provider: mount.provider,
      revision: mount.revision,
      fetchedAt: mount.fetchedAt,
      capabilities: mount.capabilities,
      resourceShape: pluginByName(mount.provider).worldDescription(),
    }));
  }

  private unionLines() {
    return this.store.mounts().map((mount) => this.unionLine(mount));
  }
  private unionLine(mount: { path: string; layers: string[] }) {
    return `${mount.path} union ${mount.layers.join(" ")}`;
  }
  private providerLines() {
    return this.mounts().map((mount) => this.providerLine(mount));
  }
  private providerLine(mount: MountRecord) {
    return `${mount.id} ${mount.path} ${mount.provider} ${mount.state}`;
  }
  private provenanceItem(item: {
    path: string;
    origin?: import("./vfs/FSNode").ProviderOrigin;
  }): Provenance {
    return item.origin
      ? { kind: "provider", path: item.path, ...item.origin }
      : { kind: "local", path: item.path };
  }
}
