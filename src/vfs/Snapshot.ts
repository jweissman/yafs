import { ProviderOrigin } from "./FSNode";
import { AbsolutePath } from "../core/AbsolutePath";

export interface SnapshotNode {
  name: string;
  dir?: boolean;
  content?: string;
  symlinkTarget?: string;
  createdAt: string;
  modifiedAt: string;
  children?: SnapshotNode[];
  unionLayers?: AbsolutePath[];
  providerOrigin?: ProviderOrigin;
}

export interface VfsSnapshot {
  version: 1;
  sequence: number;
  root: SnapshotNode;
}
