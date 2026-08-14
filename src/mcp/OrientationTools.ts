import { WorkspaceOperation } from "../operations/WorkspaceOperation";

type Arguments = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: object };

export function orientationTools(): Tool[] {
  return [startHereTool()];
}

export function orientationOperation(
  name: string,
  _input: Arguments,
): WorkspaceOperation | undefined {
  return name === "yafs.start_here" ? { name: "startHere" } : undefined;
}

const START_HERE_DESCRIPTION =
  "Report orientation: principal, cwd, mounted roots (with " +
  "revision/freshness), the caller's allowed roots when scoped, and " +
  "recommended first operations. Call this before exploring blind.";

function startHereTool(): Tool {
  return {
    name: "yafs.start_here",
    description: START_HERE_DESCRIPTION,
    inputSchema: emptySchema(),
  };
}

function emptySchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
  };
}
