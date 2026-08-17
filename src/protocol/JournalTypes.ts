import { VfsOperation } from "../vfs/VfsOperation";

export interface JournalRecord {
  version: 1;
  sequence: number;
  operation: VfsOperation;
  checksum: string;
}

export type JournalReplayer = (operation: VfsOperation) => void;
