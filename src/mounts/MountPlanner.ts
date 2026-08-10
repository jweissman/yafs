import { AbsolutePath } from "../core/AbsolutePath";
import { PathResolver } from "../core/PathResolver";
import { NodeStore } from "../vfs/NodeStore";
import { ManifestMount, MountRecord, PreparedMountRecord } from "./types";
import { ProviderRegistry } from "./ProviderRegistry";

type Declaration = {
  manifestPath: AbsolutePath;
  mount: ManifestMount;
  digest: string;
};

export class MountPlanner {
  constructor(
    private readonly store: NodeStore,
    private readonly records: () => PreparedMountRecord[],
    private readonly providers: ProviderRegistry,
  ) {}

  desired(
    mount: ManifestMount,
    digest: string,
    root: AbsolutePath,
  ): MountRecord {
    this.providers.assertGranted(mount);
    const path = PathResolver.resolve(mount.path, root);
    const manifestPath = "/.yafs/daemon-mounts.yaml" as AbsolutePath;
    return this.activeRecord(path, { manifestPath, mount, digest });
  }

  private activeRecord(
    path: AbsolutePath,
    declaration: Declaration,
  ): MountRecord {
    return {
      ...this.identity(path, declaration.mount),
      ...this.metadata(declaration.manifestPath, declaration.digest),
      ...this.lifecycle(declaration.mount),
    };
  }

  private lifecycle(mount: ManifestMount) {
    const activatedAt = new Date().toISOString();
    return {
      state: "active" as const,
      activatedAt,
      correlationId: `${mount.id}:${activatedAt}`,
      refreshIntervalMs: mount.refreshIntervalMs,
      capabilities: mount.capabilities,
    };
  }

  private identity(path: AbsolutePath, mount: ManifestMount) {
    return {
      id: mount.id,
      path,
      provider: mount.provider,
      config: mount.config,
    };
  }

  private metadata(manifestPath: AbsolutePath, digest: string) {
    return {
      manifestPath,
      manifestDigest: digest,
      revision: `fixture:${digest.slice(0, 12)}`,
    };
  }

  assertAvailable(path: AbsolutePath) {
    if (this.store.get(path, false)) {
      throw new Error(`Mount path already exists: ${path}`);
    }
    this.assertNotActive(path);
  }

  private assertNotActive(path: AbsolutePath) {
    if (this.records().some((record) => record.path === path)) {
      throw new Error(`Mount already active: ${path}`);
    }
    if (this.overlaps(path)) {
      throw new Error(`Overlapping mount: ${path}`);
    }
  }

  private overlaps(path: AbsolutePath) {
    return this.records().some(
      (record) =>
        path.startsWith(`${record.path}/`) ||
        record.path.startsWith(`${path}/`),
    );
  }
}
