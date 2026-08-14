import { McpClient } from "./types";
import { readOnlySource } from "../commands/ReadOnlySource";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";
import { literacyOperation, literacyTools } from "./LiteracyTools";
import { evidenceOperation, evidenceTools } from "./EvidenceTools";

type Arguments = Record<string, unknown>;
const operations: Record<string, PathOperationName> = {
  "yafs.list": "list",
  "yafs.read": "read",
  "yafs.inspect": "inspect",
};

type PathOperationName = "list" | "read" | "inspect";

export function tools() {
  return [
    listTool(),
    readTool(),
    inspectTool(),
    ...literacyTools(),
    ...evidenceTools(),
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

function listTool() {
  return tool(
    "yafs.list",
    "List an absolute path in the connected Yafs workspace.",
  );
}

function readTool() {
  return tool(
    "yafs.read",
    "Read a UTF-8 file from the connected Yafs workspace.",
  );
}

function inspectTool() {
  return tool(
    "yafs.inspect",
    "Report type, provenance, and union origins for a Yafs path.",
  );
}

function queryTool() {
  const properties = { source: { type: "string" } };
  return {
    name: "yafs.query",
    description: "Evaluate one read-only Yash command.",
    inputSchema: schema(properties, ["source"]),
  };
}

function tool(name: string, description: string) {
  const properties = {
    path: { type: "string", description: "Absolute Yafs path." },
  };
  return { name, description, inputSchema: schema(properties, ["path"]) };
}

function schema(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", additionalProperties: false, properties, required };
}

function operation(name: string, input: Arguments) {
  return name === "yafs.query"
    ? queryCommand(input)
    : literacyOperation(name, input) ||
        evidenceOperation(name, input) ||
        pathOperation(name, input);
}

function queryCommand(input: Arguments) {
  return readOnlySource(sourceArgument(input));
}

function pathOperation(name: string, input: Arguments): WorkspaceOperation {
  const operation = operations[name];
  if (!operation) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return { name: operation, path: pathArgument(input) };
}

function sourceArgument(input: Arguments) {
  if (typeof input.source !== "string") {
    throw new Error("source must be a string");
  }
  return input.source;
}

function argumentsFor(input: unknown): Arguments {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool arguments must be an object");
  }
  return input as Arguments;
}

function pathArgument(input: Arguments) {
  const path = input.path;
  if (typeof path !== "string" || !/^\/[A-Za-z0-9._/-]*$/.test(path)) {
    throw new Error("path must be an absolute Yafs path");
  }
  return path;
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
