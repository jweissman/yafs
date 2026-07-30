import { AbsolutePath } from '../core/AbsolutePath';


export type Mutation = { type: 'mkdir'; path: AbsolutePath; } |
{ type: 'touch'; path: AbsolutePath; } |
{ type: 'write'; path: AbsolutePath; content: string; } |
{ type: 'symlink'; path: AbsolutePath; target: string; } |
{ type: 'union'; path: AbsolutePath; layers: AbsolutePath[]; } |
{ type: 'remove'; path: AbsolutePath; };
