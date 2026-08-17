import { Tool, boolean, integer, string, tool } from "./LiteracyToolSchemas";

export function grepTool(): Tool {
  return grepToolResult(grepProperties());
}

function grepProperties() {
  return { ...grepCoreProperties(), ...grepFlagProperties() };
}

function grepCoreProperties() {
  return {
    pattern: string(),
    paths: { type: "array", items: string() },
    limit: integer(),
  };
}

function grepFlagProperties() {
  return {
    ignoreCase: boolean(),
    invert: boolean(),
    countOnly: boolean(),
    filesOnly: boolean(),
  };
}

function grepToolResult(properties: object): Tool {
  return tool("yafs.grep", grepDescription(), {
    properties,
    required: ["pattern", "paths"],
  });
}

function grepDescription(): string {
  return grepPathDescription() + grepFlagDescription();
}

function grepPathDescription(): string {
  return (
    "Find literal text in virtual files. A path may be a file, a " +
    "directory (searched recursively), or contain wildcard segments: " +
    '"*" for exactly one path component (e.g. "pulls/*/diff.patch"), ' +
    '"**" for any depth (e.g. "**/diff.patch"). '
  );
}

function grepFlagDescription(): string {
  return (
    "The response always reports count (total matches) and files " +
    "(deduped paths with a match), even when matches itself is empty " +
    "or truncated -- set countOnly or filesOnly to skip paying for " +
    "full match detail when only the aggregate is needed, e.g. to scan " +
    "broadly across many files cheaply before reading a specific one " +
    "in full."
  );
}
