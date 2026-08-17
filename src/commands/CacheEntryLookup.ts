import { cacheMetadataPath, cacheMetadataRoot } from "../cache/CachePaths";
import { CommandContext } from "./CommandContext";

export function entry(context: CommandContext, key: string) {
  return context.exists(cacheMetadataPath(key))
    ? context.cache.parse(context.read(cacheMetadataPath(key)))
    : undefined;
}

export function requiredEntry(context: CommandContext, key: string) {
  const item = storedEntry(context, key);
  if (context.cache.expired(item, context.clock.now())) {
    throw new Error(`Cache miss: ${key}`);
  }
  return item;
}

export function storedEntry(context: CommandContext, key: string) {
  const item = entry(context, key);
  if (!item) {
    throw new Error(`Cache miss: ${key}`);
  }
  return item;
}

export function expired(context: CommandContext) {
  const entries = storedEntries(context);
  return entries.filter((item) =>
    context.cache.expired(item, context.clock.now()),
  );
}

function storedEntries(context: CommandContext) {
  const paths = context.exists(cacheMetadataRoot)
    ? context.list(cacheMetadataRoot)
    : [];
  return paths.map((name) => context.cache.parse(context.read(child(name))));
}

function child(name: string) {
  return `${cacheMetadataRoot}/${name}` as import("../core/AbsolutePath").AbsolutePath;
}
