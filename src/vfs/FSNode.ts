import { AbsolutePath } from '../core/AbsolutePath'

export type ProviderOrigin = {
  mountId: string, provider: string, revision: string, activatedAt: string, readOnly: true
}

export type FSNode = {
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
};
