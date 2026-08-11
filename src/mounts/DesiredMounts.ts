import { readFile } from "node:fs/promises";
import { AbsolutePath } from "../core/AbsolutePath";
import { parseManifest } from "./Manifest";
import { MountManager } from "./MountManager";
import { Change, DesiredMountChanges } from "./DesiredMountChanges";
import { activeEntries } from "./DesiredMountEntries";
import { applyChange, Mutations, Target } from "./DesiredMountPublish";
import {
  noPluginConfiguration,
  unconfiguredPluginRemedy,
} from "./PluginConfiguration";

type DesiredMountsOptions = { path?: string; root?: AbsolutePath };
export class DesiredMounts {
  private readonly path?: string;
  private readonly root: AbsolutePath;
  private readonly planner: DesiredMountChanges;

  constructor(
    private readonly mounts: MountManager,
    options: DesiredMountsOptions = {},
  ) {
    this.path = options.path;
    this.root = options.root || "/home/root";
    this.planner = new DesiredMountChanges(this.root);
  }

  async status() {
    return this.report(await this.loaded());
  }
  async plan() {
    const loaded = await this.loaded();
    return loaded ? this.changesFor(loaded) : [];
  }
  async apply(mutations: Mutations, prune = false) {
    const loaded = await this.required();
    const changes = this.changesFor(loaded, prune);
    const target = this.target();
    for (const change of changes) {
      await applyChange(target, change, loaded.manifest.mounts, mutations);
    }
    return changes;
  }
  async refreshOne(id: string, mutations: Mutations) {
    const loaded = await this.required();
    const change: Change = { id, action: this.forcedAction(id) };
    await applyChange(this.target(), change, loaded.manifest.mounts, mutations);
    return change;
  }

  private target(): Target {
    return { mounts: this.mounts, root: this.root };
  }

  private changesFor(
    loaded: NonNullable<ReturnType<DesiredMounts["parse"]>>,
    prune = false,
  ) {
    return this.planner.plan(
      this.mounts.mounts(),
      loaded.manifest.mounts,
      prune,
    );
  }

  private forcedAction(id: string): "activate" | "refresh" {
    return this.mounts.mounts().some((record) => record.id === id)
      ? "refresh"
      : "activate";
  }

  private async required() {
    const loaded = await this.loaded();
    if (!loaded) {
      throw new Error(noPluginConfiguration());
    }
    return loaded;
  }
  private async loaded() {
    return this.path ? this.parse(await this.read()) : undefined;
  }
  private async read() {
    try {
      return await readFile(this.path!, "utf8");
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }
  private parse(source: string | undefined) {
    return source && parseManifest(source);
  }
  private report(loaded: ReturnType<DesiredMounts["parse"]>) {
    return {
      configured: Boolean(loaded),
      changes: loaded ? this.changesFor(loaded) : [],
      active: activeEntries(this.mounts),
      ...(loaded ? {} : { remedy: unconfiguredPluginRemedy() }),
    };
  }
}
