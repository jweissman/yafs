import { AbsolutePath } from "../core/AbsolutePath";

export interface ProviderOrigin {
  mountId: string;
  provider: string;
  revision: string;
  activatedAt: string;
  fetchedAt?: string;
  readOnly: true;
}

export interface FSNode {
  name: string;
  children?: FSNode[];
  dir?: boolean;
  content?: string;
  symlinkTarget?: string;
  unionLayers?: AbsolutePath[];
  providerOrigin?: ProviderOrigin;
  parent?: FSNode;
  createdAt: Date;
  modifiedAt: Date;
}
