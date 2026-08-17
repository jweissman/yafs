import { CacheRequest } from "../cache/CacheRequest";
import { cacheMetadataPath } from "../cache/CachePaths";
import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { expired, requiredEntry, storedEntry } from "./CacheEntryLookup";
import { put } from "./CachePut";
import { shellRequest } from "./CacheRequestParsing";

export function cacheCommands(): BuiltinCommand[] {
  return [cacheCommand()];
}

function cacheCommand(): BuiltinCommand {
  return {
    name: "cache",
    synopsis:
      "cache put --ttl DURATION KEY VALUE | get KEY | stat KEY | delete KEY | gc",
    access: "mutate",
    execute: (context, args) => cache(context, args),
  };
}
function cache(context: CommandContext, args: string[]) {
  const request = shellRequest(context, args);
  if (request) {
    return cacheRequest(context, request);
  }
  throw new Error("cache expects put, get, stat, delete, or gc");
}
export async function cacheRequest(
  context: CommandContext,
  request: CacheRequest,
): Promise<string> {
  if (request.operation === "put") {
    return put(context, request);
  }
  return readOrMutate(context, request);
}
function readOrMutate(
  context: CommandContext,
  request: Exclude<CacheRequest, { operation: "put" }>,
) {
  if (request.operation === "get") {
    return get(context, request.key);
  }
  return inspectOrMutate(context, request);
}
function inspectOrMutate(
  context: CommandContext,
  request: Exclude<CacheRequest, { operation: "put" | "get" }>,
) {
  if (request.operation === "stat") {
    return stat(context, request.key);
  }
  return deleteOrGc(context, request);
}

function deleteOrGc(
  context: CommandContext,
  request: Exclude<CacheRequest, { operation: "put" | "get" | "stat" }>,
) {
  return request.operation === "delete"
    ? remove(context, request.key)
    : gc(context);
}
async function get(context: CommandContext, key: string) {
  return context.cache.read(requiredEntry(context, key));
}
function stat(context: CommandContext, key: string) {
  const item = storedEntry(context, key);
  const state = context.cache.expired(item, context.clock.now())
    ? "expired"
    : "active";
  return JSON.stringify({ ...item, state });
}
function remove(context: CommandContext, key: string) {
  const item = requiredEntry(context, key);
  context.remove(cacheMetadataPath(key));
  context.afterCommit(() => {
    context.cache.release(item);
  });
  return "";
}
async function gc(context: CommandContext) {
  expired(context).forEach((item) => {
    context.cache.release(item);
  });
  return JSON.stringify(await context.cache.gc());
}
