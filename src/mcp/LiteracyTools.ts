import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import {
  Tool,
  treeTool,
  findTool,
  testTool,
  diffTool,
} from "./LiteracyToolSchemas";
import { grepTool } from "./LiteracyGrepToolSchema";
import {
  Arguments,
  tree,
  find,
  test,
  grep,
  diff,
} from "./LiteracyOperationParsing";

export type { Tool };

export function literacyTools(): Tool[] {
  return [treeTool(), findTool(), testTool(), grepTool(), diffTool()];
}

type Parser = (input: Arguments) => WorkspaceOperation;
const parsers: Partial<Record<string, Parser>> = {
  "yafs.tree": tree,
  "yafs.find": find,
  "yafs.test": test,
  "yafs.grep": grep,
  "yafs.diff": diff,
};

export function literacyOperation(name: string, input: Arguments) {
  return parsers[name]?.(input);
}
