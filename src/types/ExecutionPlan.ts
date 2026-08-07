import { ExecutionResult } from "./ExecutionResult";
import { VfsOperation } from "../vfs/VfsOperation";

export type ExecutionPlan = {
  result: ExecutionResult;
  operations: VfsOperation[];
};
