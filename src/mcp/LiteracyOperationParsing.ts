import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  optionalType,
  pathValue,
  paths,
  predicate,
  requiredString,
} from "./LiteracyValueParsing";

export type Arguments = Record<string, unknown>;

export function tree(input: Arguments): WorkspaceOperation {
  return {
    name: "tree",
    path: path(input),
    depth: optionalInteger(input.depth),
    limit: optionalInteger(input.limit),
  };
}

export function find(input: Arguments): WorkspaceOperation {
  return {
    name: "find",
    path: path(input),
    pattern: optionalString(input.pattern),
    type: optionalType(input.type),
    limit: optionalInteger(input.limit),
  };
}

export function test(input: Arguments): WorkspaceOperation {
  return {
    name: "test",
    path: path(input),
    predicate: predicate(input.predicate),
  };
}

export function grep(input: Arguments): WorkspaceOperation {
  return {
    name: "grep",
    pattern: requiredString(input.pattern),
    paths: paths(input.paths),
    limit: optionalInteger(input.limit),
    ...grepFlags(input),
  };
}

function grepFlags(input: Arguments) {
  return {
    ignoreCase: optionalBoolean(input.ignoreCase),
    invert: optionalBoolean(input.invert),
    countOnly: optionalBoolean(input.countOnly),
    filesOnly: optionalBoolean(input.filesOnly),
  };
}

export function diff(input: Arguments): WorkspaceOperation {
  return {
    name: "diff",
    left: pathValue(input.left),
    right: pathValue(input.right),
    limit: optionalInteger(input.limit),
  };
}

function path(input: Arguments) {
  return pathValue(input.path);
}
