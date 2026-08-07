import { Clock, systemClock } from "../core/Clock";
import { AbsolutePath } from "../core/AbsolutePath";
import { NodeStoreInspection } from "./NodeStoreInspection";
import { NodeStoreMutation } from "./NodeStoreMutation";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreSnapshot } from "./NodeStoreSnapshot";
import { NodeStoreState } from "./NodeStoreState";
import { ProviderOrigin } from "./FSNode";
import { createNodeStoreComponents } from "./NodeStoreComponents";
import { VfsSnapshot } from "./Snapshot";
import { VfsOperation } from "./VfsOperation";

export class NodeStore {
  private readonly state: NodeStoreState;
  private readonly resolver: NodeStoreResolver;
  private readonly mutation: NodeStoreMutation;
  private readonly inspection: NodeStoreInspection;
  private readonly snapshots: NodeStoreSnapshot;
  constructor(clock?: Clock) {
    const components = createNodeStoreComponents(clock || systemClock);
    this.state = components.state;
    this.resolver = components.resolver;
    this.mutation = components.mutation;
    this.inspection = components.inspection;
    this.snapshots = components.snapshots;
    this.initialize();
  }
  private initialize() {
    this.mkdir("/home");
    this.mkdir("/home/root");
  }
  get origin() {
    return this.state.origin;
  }
  getNode(inode: number) {
    return this.state.nodes[inode];
  }
  get(path: AbsolutePath, follow?: boolean, depth?: number) {
    return this.resolver.get(path, follow ?? true, depth ?? 0);
  }
  mkdir(path: AbsolutePath, at?: Date) {
    return this.mutation.mkdir(path, at);
  }
  write(path: AbsolutePath, content: string, at?: Date) {
    return this.mutation.write(path, content, at);
  }
  touch(path: AbsolutePath, at?: Date) {
    return this.mutation.touch(path, at);
  }
  remove(path: AbsolutePath) {
    return this.mutation.remove(path);
  }
  removeTree(path: AbsolutePath) {
    return this.mutation.removeTree(path);
  }
  setProviderOrigin(path: AbsolutePath, origin: ProviderOrigin) {
    return this.mutation.setProviderOrigin(path, origin);
  }
  union(path: AbsolutePath, layers: AbsolutePath[], at?: Date) {
    return this.mutation.union(path, layers, at);
  }
  symlink(target: string, path: AbsolutePath, at?: Date) {
    return this.mutation.symlink(target, path, at);
  }
  apply(item: VfsOperation) {
    return this.mutation.apply(item);
  }
  read(path: AbsolutePath) {
    return this.inspection.read(path);
  }
  readlink(path: AbsolutePath) {
    return this.inspection.readlink(path);
  }
  type(path: AbsolutePath, follow?: boolean) {
    return this.inspection.type(path, follow ?? true);
  }
  list(path: AbsolutePath) {
    return this.inspection.list(path);
  }
  origins(path: AbsolutePath) {
    return this.inspection.origins(path);
  }
  provenance(path: AbsolutePath) {
    return this.inspection.provenance(path);
  }
  mounts() {
    return this.inspection.mounts();
  }
  validate(items: VfsOperation[]) {
    return this.snapshots.validate(items);
  }
  snapshot(sequence: number): VfsSnapshot {
    return this.snapshots.snapshot(sequence);
  }
  restore(snapshot: VfsSnapshot) {
    return this.snapshots.restore(snapshot);
  }
}
