import { Word } from '../lang/Word';


export type Command = {
  kind: 'command';
  name: string;
  args: Word[];
  redirect?: { kind: 'output'; target: string; };
};
