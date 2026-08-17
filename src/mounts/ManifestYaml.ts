import { parseDocument } from "yaml";

type YamlDocument = ReturnType<typeof parseDocument>;
interface YamlNode {
  anchor?: unknown;
  tag?: unknown;
  items?: unknown[];
  key?: unknown;
  value?: unknown;
}

export function decoded(source: string) {
  const document = parsedDocument(source);
  assertParsed(document);
  return documentValue(document);
}

function parsedDocument(source: string) {
  return parseDocument(source, {
    schema: "core",
    uniqueKeys: true,
    merge: false,
  });
}

function assertParsed(document: YamlDocument) {
  const issue = [...document.errors, ...document.warnings].at(0);
  if (issue !== undefined) {
    throw new Error(`Invalid manifest YAML: ${issue.message}`);
  }
}

function documentValue(document: YamlDocument) {
  assertPlainNodes(document.contents);
  try {
    return decodedValue(document);
  } catch (error) {
    throw new Error(`Invalid manifest YAML: ${reason(error)}`, {
      cause: error,
    });
  }
}

function decodedValue(document: YamlDocument): unknown {
  return document.toJS({ maxAliasCount: 0 }) as unknown;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertPlainNodes(node: unknown) {
  if (!node || typeof node !== "object") {
    return;
  }
  const value = node as YamlNode;
  if (value.anchor || value.tag) {
    throw new Error("Invalid manifest YAML: anchors and tags are not allowed");
  }
  assertChildren(value);
}

function assertChildren(node: YamlNode) {
  node.items?.forEach(assertPlainNodes);
  assertPlainNodes(node.key);
  assertPlainNodes(node.value);
}
