import { AbsolutePath } from "../core/AbsolutePath";
import { FSNode } from "./FSNode";
import { assertAbsent, parentOf } from "./NodeStoreParent";
import { NodeStoreResolver } from "./NodeStoreResolver";
import { NodeStoreState } from "./NodeStoreState";

export interface FileDeps {
  state: NodeStoreState;
  resolver: NodeStoreResolver;
  assertWritable: (path: AbsolutePath) => void;
}

export interface WriteRequest {
  path: AbsolutePath;
  content: string;
  at: Date;
}

export function touch(deps: FileDeps, path: AbsolutePath, at: Date) {
  deps.assertWritable(path);
  const existing = deps.resolver.get(path);
  if (existing) {
    existing.modifiedAt = at;
    return;
  }
  create(deps, path, false, at);
}

export function write(deps: FileDeps, request: WriteRequest) {
  deps.assertWritable(request.path);
  writeChecked(deps, request);
}

function writeChecked(deps: FileDeps, request: WriteRequest) {
  const node = deps.resolver.get(request.path);
  if (node) {
    replace(node, request);
    return;
  }
  created(deps, request);
}

function created(deps: FileDeps, request: WriteRequest) {
  const { parent, name } = parentOf(deps.resolver, request.path);
  const node = deps.state.createNode(name, false, parent, request.at);
  node.content = request.content;
}

function replace(node: FSNode, request: WriteRequest) {
  if (node.dir) {
    throw new Error(`Is a directory: ${request.path}`);
  }
  node.content = request.content;
  node.modifiedAt = request.at;
}

export function create(
  deps: FileDeps,
  path: AbsolutePath,
  dir: boolean,
  at: Date,
) {
  deps.assertWritable(path);
  const { parent, name } = newParent(deps, path);
  deps.state.createNode(name, dir, parent, at);
}

function newParent(deps: FileDeps, path: AbsolutePath) {
  const { parent, name } = parentOf(deps.resolver, path);
  assertAbsent(parent, name, path);
  return { parent, name };
}
