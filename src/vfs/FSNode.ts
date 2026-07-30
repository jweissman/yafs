export type FSNode = {
  name: string;
  children?: FSNode[];
  dir?: boolean;
  content?: string;
  symlinkTarget?: string;
  unionLayers?: FSNode[];
  parent?: FSNode;
  createdAt: Date;
  modifiedAt: Date;
};
