import { ExecutionResult } from "./ExecutionResult";
import { VfsOperation } from "../vfs/VfsOperation";

export interface ExecutionPlan {
  result: ExecutionResult;
  operations: VfsOperation[];
}
