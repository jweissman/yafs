import * as ohm from 'ohm-js';

export type AstNode = ohm.Node & { ast(): unknown; };
