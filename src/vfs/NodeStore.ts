import { Clock, systemClock } from '../core/Clock';
import { Mutation } from '../types/Mutation';
import { PathResolver } from '../core/PathResolver';
import { AbsolutePath } from '../core/AbsolutePath';
import { FSNode } from './FSNode';


export class NodeStore {
  nodes: { [inode: number]: FSNode; } = {
    1: { name: '/', dir: true, children: [], createdAt: new Date(0), modifiedAt: new Date(0) }
  };
  private nextInode = 2;

  constructor(private readonly clock: Clock = systemClock) {
    this.mkdir('/home');
    this.mkdir('/home/root');
  }

  get origin() { return this.nodes[1]; }

  private createNode(name: string, dir: boolean, parent: FSNode) {
    const now = this.clock.now();
    const node: FSNode = { name, dir, children: dir ? [] : undefined, parent, createdAt: now, modifiedAt: now };
    this.nodes[this.nextInode++] = node;
    parent.children ||= [];
    parent.children.push(node);
    return node;
  }

  getNode(inode: number) { return this.nodes[inode]; }

  get(path: AbsolutePath, followFinalSymlink = true, depth = 0): FSNode | undefined {
    if (depth > 40) throw new Error('Too many symbolic links');
    if (path === '/') return this.origin;
    return this.find(this.origin, path.slice(1).split('/'), followFinalSymlink, depth);
  }

  private find(node: FSNode, segments: string[], followFinal: boolean, depth: number): FSNode | undefined {
    const child = this.child(node, segments[0]);
    if (!child) return undefined;
    if (child.symlinkTarget && (followFinal || segments.length > 1)) return this.follow(child, segments.slice(1), followFinal, depth);
    return segments.length === 1 ? child : this.find(child, segments.slice(1), followFinal, depth);
  }

  private follow(link: FSNode, remainder: string[], followFinal: boolean, depth: number): FSNode | undefined {
    const target = this.linkTarget(link);
    const path = remainder.length ? `${target}/${remainder.join('/')}` : target;
    return this.get(PathResolver.resolve(path, '/'), followFinal, depth + 1);
  }

  private linkTarget(link: FSNode): string {
    return link.symlinkTarget!.startsWith('/') ? link.symlinkTarget! : `${this.pathOf(link.parent || this.origin)}/${link.symlinkTarget}`;
  }

  mkdir(path: AbsolutePath) {
    this.assertWritable(path);
    const { parent, name } = this.parentFor(path);
    if (parent.children?.some(child => child.name === name)) {
      throw new Error(`Path already exists: ${path}`);
    }
    this.createNode(name, true, parent);
  }

  write(path: AbsolutePath, content: string) {
    this.assertWritable(path);
    const existing = this.get(path);
    if (existing) return this.replaceFile(existing, path, content);
    const { parent, name } = this.parentFor(path);
    this.createNode(name, false, parent).content = content;
  }

  private replaceFile(node: FSNode, path: AbsolutePath, content: string) {
    if (node.dir) throw new Error(`Is a directory: ${path}`);
    node.content = content;
    node.modifiedAt = this.clock.now();
  }

  read(path: AbsolutePath): string {
    const node = this.get(path);
    if (!node) throw new Error(`No such file: ${path}`);
    if (node.dir) throw new Error(`Is a directory: ${path}`);
    return node.content || '';
  }

  touch(path: AbsolutePath) {
    this.assertWritable(path);
    const existing = this.get(path);
    if (existing) return this.updateTimestamp(existing);
    const { parent, name } = this.parentFor(path);
    this.createNode(name, false, parent);
  }

  private updateTimestamp(node: FSNode) { node.modifiedAt = this.clock.now(); }

  remove(path: AbsolutePath) {
    this.assertWritable(path);
    const { parent, name } = this.parentFor(path);
    const index = parent.children?.findIndex(child => child.name === name) ?? -1;
    if (index < 0) throw new Error(`No such file: ${path}`);
    if (parent.children![index].dir) throw new Error(`Is a directory: ${path}`);
    parent.children!.splice(index, 1);
  }

  list(path: AbsolutePath): string[] {
    const node = this.get(path);
    if (!node) throw new Error(`No such directory: ${path}`);
    if (!node.dir) throw new Error(`Not a directory: ${path}`);
    return node.unionLayers ? this.unionNames(node) : this.names(node);
  }

  private names(node: FSNode): string[] { return (node.children || []).map(child => child.name).sort(); }

  private unionNames(node: FSNode): string[] {
    return [...new Set(node.unionLayers!.flatMap(layer => this.entries(layer).map(child => child.name)))];
  }

  union(path: AbsolutePath, layers: AbsolutePath[]) {
    const { parent, name } = this.parentFor(path);
    if (parent.children?.some(child => child.name === name)) throw new Error(`Path already exists: ${path}`);
    const mount = this.createNode(name, true, parent);
    mount.unionLayers = layers.map(layer => this.unionLayer(layer));
  }

  private unionLayer(path: AbsolutePath): FSNode {
    const node = this.get(path);
    if (!node?.dir) throw new Error(`Union layer is not a directory: ${path}`);
    return node;
  }

  origins(path: AbsolutePath): string[] {
    return this.findOrigins(this.origin, path.slice(1).split('/'), path);
  }

  private findOrigins(node: FSNode, segments: string[], path: AbsolutePath): string[] {
    if (node.unionLayers) return this.unionOrigins(node, segments);
    const child = node.children?.find(candidate => candidate.name === segments[0]);
    if (!child) throw new Error(`No such file: ${path}`);
    return segments.length === 1 ? [this.pathOf(child)] : this.findOrigins(child, segments.slice(1), path);
  }

  private unionOrigins(node: FSNode, segments: string[]): string[] {
    return node.unionLayers!.map(layer => this.resolveFrom(layer, segments)).filter(this.isNode).map(child => this.pathOf(child));
  }

  mounts(): { path: string; layers: string[]; }[] {
    const mounts: { path: string; layers: string[]; }[] = [];
    this.collectMounts(this.origin, mounts);
    return mounts;
  }

  private collectMounts(node: FSNode, mounts: { path: string; layers: string[]; }[]) {
    if (node.unionLayers) mounts.push({ path: this.pathOf(node), layers: node.unionLayers.map(layer => this.pathOf(layer)) });
    for (const child of node.children || []) this.collectMounts(child, mounts);
  }

  symlink(target: string, path: AbsolutePath) {
    const { parent, name } = this.parentFor(path);
    if (parent.children?.some(child => child.name === name)) {
      throw new Error(`Path already exists: ${path}`);
    }
    this.createNode(name, false, parent).symlinkTarget = target;
  }

  readlink(path: AbsolutePath): string {
    const node = this.get(path, false);
    if (!node) throw new Error(`No such file: ${path}`);
    if (!node.symlinkTarget) throw new Error(`Not a symbolic link: ${path}`);
    return node.symlinkTarget;
  }

  type(path: AbsolutePath, followFinalSymlink = true): 'file' | 'directory' | 'symlink' {
    const node = this.get(path, followFinalSymlink);
    if (!node) throw new Error(`No such file: ${path}`);
    if (node.symlinkTarget) return 'symlink';
    return node.dir ? 'directory' : 'file';
  }

  apply(mutation: Mutation) {
    if (mutation.type === 'mkdir') return this.mkdir(mutation.path);
    if (mutation.type === 'touch') return this.touch(mutation.path);
    if (mutation.type === 'write') return this.write(mutation.path, mutation.content);
    if (mutation.type === 'symlink') return this.symlink(mutation.target, mutation.path);
    if (mutation.type === 'union') return this.union(mutation.path, mutation.layers);
    return this.remove(mutation.path);
  }

  private parentFor(path: AbsolutePath): { parent: FSNode; name: string; } {
    const parts = path.slice(1).split('/');
    const name = parts.pop();
    const parentPath = `/${parts.join('/')}` as AbsolutePath;
    return this.validateParent(this.get(parentPath), name, parentPath);
  }

  private validateParent(parent: FSNode | undefined, name: string | undefined, path: AbsolutePath) {
    if (!name || !parent) throw new Error(`No such parent directory: ${path}`);
    if (!parent.dir) throw new Error(`Not a directory: ${path}`);
    if (parent.unionLayers) throw new Error(`Read-only union mount: ${path}`);
    return { parent, name };
  }

  private child(node: FSNode, name: string): FSNode | undefined {
    return node.unionLayers ? this.childInLayers(node.unionLayers, name) : node.children?.find(candidate => candidate.name === name);
  }

  private childInLayers(layers: FSNode[], name: string): FSNode | undefined {
    for (const layer of layers) { const child = this.child(layer, name); if (child) return child; }
  }

  private entries(node: FSNode): FSNode[] {
    if (!node.unionLayers) return node.children || [];
    const entries = new Map<string, FSNode>();
    for (const layer of node.unionLayers) {
      for (const child of this.entries(layer)) entries.set(child.name, entries.get(child.name) || child);
    }
    return [...entries.values()];
  }

  private assertWritable(path: AbsolutePath, depth = 0) {
    if (depth > 40) throw new Error('Too many symbolic links');
    this.assertWritableSegments(this.origin, path.slice(1).split('/'), path, depth);
  }

  private assertWritableSegments(node: FSNode, segments: string[], path: AbsolutePath, depth: number) {
    if (node.unionLayers) throw new Error(`Read-only union mount: ${path}`);
    const child = node.children?.find(candidate => candidate.name === segments[0]);
    if (!child) return;
    if (child.symlinkTarget) return this.assertWritableLink(child, segments.slice(1), depth);
    if (segments.length > 1) return this.assertWritableSegments(child, segments.slice(1), path, depth);
    if (child.unionLayers) throw new Error(`Read-only union mount: ${path}`);
  }

  private assertWritableLink(link: FSNode, remainder: string[], depth: number) {
    const target = this.linkTarget(link);
    const path = remainder.length ? `${target}/${remainder.join('/')}` : target;
    this.assertWritable(PathResolver.resolve(path, '/'), depth + 1);
  }

  private resolveFrom(node: FSNode, segments: string[]): FSNode | undefined {
    return segments.reduce<FSNode | undefined>((current, segment) => current && this.child(current, segment), node);
  }

  private pathOf(node: FSNode): string {
    const names: string[] = [];
    for (let current: FSNode | undefined = node; current?.parent; current = current.parent) names.unshift(current.name);
    return `/${names.join('/')}`;
  }

  private isNode(node: FSNode | undefined): node is FSNode { return !!node }
}
