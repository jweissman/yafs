import { parseDocument } from "yaml";

type YamlDocument = ReturnType<typeof parseDocument>;
type YamlNode = {
  anchor?: unknown;
  tag?: unknown;
  items?: unknown[];
  key?: unknown;
  value?: unknown;
};

export function decoded(source: string) {
  const document = parsedDocument(source);
  if (document.errors.length || document.warnings.length) {
    throw new Error("Invalid .yafsmeta YAML");
  }
  return documentValue(document);
}

function parsedDocument(source: string) {
  return parseDocument(source, {
    schema: "core",
    uniqueKeys: true,
    merge: false,
  });
}

function documentValue(document: YamlDocument) {
  assertPlainNodes(document.contents);
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch {
    throw new Error("Invalid .yafsmeta YAML");
  }
}

function assertPlainNodes(node: unknown) {
  if (!node || typeof node !== "object") {
    return;
  }
  const value = node as YamlNode;
  if (value.anchor || value.tag) {
    throw new Error("Invalid .yafsmeta YAML");
  }
  assertChildren(value);
}

function assertChildren(node: YamlNode) {
  node.items?.forEach(assertPlainNodes);
  assertPlainNodes(node.key);
  assertPlainNodes(node.value);
}
