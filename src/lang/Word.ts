import { Expression } from '../types/Expression';


export type Word = { kind: 'literal'; value: string; } |
{ kind: 'variable'; name: string; } |
{ kind: 'compound'; parts: Word[]; } |
{ kind: 'arithmetic'; expression: Expression; };
