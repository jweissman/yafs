export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

export function treeTool(): Tool {
  const properties = { path: string(), depth: integer(), limit: integer() };
  return tool("yafs.tree", "List a bounded virtual directory tree.", {
    properties,
    required: ["path"],
  });
}

export function findTool(): Tool {
  const properties = {
    path: string(),
    pattern: string(),
    type: string(),
    limit: integer(),
  };
  return findToolResult(properties);
}

function findToolResult(properties: object): Tool {
  return tool("yafs.find", "Find bounded virtual paths.", {
    properties,
    required: ["path"],
  });
}

export function testTool(): Tool {
  const properties = { path: string(), predicate: string() };
  return tool("yafs.test", "Evaluate one virtual path predicate.", {
    properties,
    required: ["path", "predicate"],
  });
}

export function grepTool(): Tool {
  const properties = {
    pattern: string(),
    paths: { type: "array", items: string() },
    limit: integer(),
  };
  return grepToolResult(properties);
}

function grepToolResult(properties: object): Tool {
  return tool("yafs.grep", "Find literal text in virtual files.", {
    properties,
    required: ["pattern", "paths"],
  });
}

export function diffTool(): Tool {
  const properties = { left: string(), right: string(), limit: integer() };
  return tool("yafs.diff", diffDescription(), { properties, required: ["left", "right"] });
}

function diffDescription(): string {
  return "Structurally compare two EXISTING virtual paths (both required) " +
    "and report what changed between them. Not for viewing a diff " +
    "that's already provided as a file (e.g. a PR's diff.patch) -- " +
    "use yafs.read for that instead.";
}

interface ToolSpec {
  properties: object;
  required: string[];
}

function tool(name: string, description: string, spec: ToolSpec): Tool {
  return { name, description, inputSchema: schema(spec) };
}

function schema(spec: ToolSpec) {
  return {
    type: "object",
    additionalProperties: false,
    properties: spec.properties,
    required: spec.required,
  };
}

function string() {
  return { type: "string" };
}
function integer() {
  return { type: "integer", minimum: 0 };
}
