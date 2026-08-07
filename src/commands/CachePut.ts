import { CacheEntry } from "../cache/CacheService";
import { CacheRequest } from "../cache/CacheRequest";
import {
  cacheMetadataPath,
  cacheMetadataRoot,
  cacheRoot,
} from "../cache/CachePaths";
import { CommandContext } from "./CommandContext";
import { entry } from "./CacheEntryLookup";
import { duration } from "./CacheDuration";

type PutRequest = Extract<CacheRequest, { operation: "put" }>;

export function putRequest(
  context: CommandContext,
  args: string[],
): CacheRequest {
  if (args[1] !== "--ttl") {
    throw new Error("cache put requires --ttl DURATION");
  }
  return {
    operation: "put",
    ttlMs: duration(context.required("cache put", args, 2)),
    key: context.required("cache put", args, 3),
    value: context.required("cache put", args, 4),
  };
}

export async function put(context: CommandContext, request: PutRequest) {
  const previous = entry(context, request.key);
  const next = await createEntry(context, request);
  publish(context, request.key, next);
  retain(context, previous, next);
  return "";
}

function createEntry(context: CommandContext, request: PutRequest) {
  return context.cache.create(
    request.key,
    request.value,
    request.ttlMs,
    context.clock.now(),
  );
}

function publish(context: CommandContext, key: string, next: CacheEntry) {
  parents(context);
  context.write(cacheMetadataPath(key), JSON.stringify(next));
}

function parents(context: CommandContext) {
  if (!context.exists(cacheRoot)) {
    context.mkdir(cacheRoot);
  }
  if (!context.exists(cacheMetadataRoot)) {
    context.mkdir(cacheMetadataRoot);
  }
}

function retain(
  context: CommandContext,
  previous: CacheEntry | undefined,
  next: CacheEntry,
) {
  context.afterCommit(() => releaseAndRetain(context, previous, next));
}

function releaseAndRetain(
  context: CommandContext,
  previous: CacheEntry | undefined,
  next: CacheEntry,
) {
  if (previous) {
    context.cache.release(previous);
  }
  context.cache.retain(next);
}
