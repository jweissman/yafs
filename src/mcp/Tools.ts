import { McpClient } from "./types";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import { literacyOperation, literacyTools } from "./LiteracyTools";
import { evidenceOperation, evidenceTools } from "./EvidenceTools";
import { orientationOperation, orientationTools } from "./OrientationTools";
import { pathOperation, pathTools } from "./PathTools";
import { queryCommand, queryTool } from "./QueryTool";

type Arguments = Record<string, unknown>;

export function tools() {
  return [
    ...pathTools(),
    ...literacyTools(),
    ...evidenceTools(),
    ...orientationTools(),
    queryTool(),
  ];
}

export async function callTool(
  client: McpClient,
  name: string,
  input: unknown,
) {
  return attemptTool(client, name, input).catch(failure);
}

async function attemptTool(client: McpClient, name: string, input: unknown) {
  return result(await run(client, operation(name, argumentsFor(input))));
}

function operation(name: string, input: Arguments) {
  return name === "yafs.query"
    ? queryCommand(input)
    : literacyOperation(name, input) ||
        evidenceOperation(name, input) ||
        orientationOperation(name, input) ||
        pathOperation(name, input);
}

function argumentsFor(input: unknown): Arguments {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool arguments must be an object");
  }
  return input as Arguments;
}

async function run(client: McpClient, command: string | WorkspaceOperation) {
  const output =
    typeof command === "string"
      ? await client.execute(command)
      : await client.operation(command);
  if (output.error) {
    throw new Error(output.error.message);
  }
  return output.stdout;
}

function result(text: string) {
  return { content: [{ type: "text", text }], isError: false };
}
export function failure(error: unknown) {
  return { content: [{ type: "text", text: message(error) }], isError: true };
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
