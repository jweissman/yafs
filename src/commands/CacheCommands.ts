import { CacheRequest } from "../cache/CacheRequest";
import { cacheMetadataPath } from "../cache/CachePaths";
import { BuiltinCommand } from "./BuiltinCommand";
import { CommandContext } from "./CommandContext";
import { expired, requiredEntry, storedEntry } from "./CacheEntryLookup";
import { put, putRequest } from "./CachePut";

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
function shellRequest(
  context: CommandContext,
  args: string[],
): CacheRequest | undefined {
  if (args[0] === "put") {
    return putRequest(context, args);
  }
  return readOrGcRequest(context, args);
}

function readOrGcRequest(context: CommandContext, args: string[]) {
  if (["get", "stat", "delete"].includes(args[0])) {
    return simpleRequest(context, args);
  }
  if (args[0] === "gc") {
    return { operation: "gc" as const };
  }
}

function simpleRequest(context: CommandContext, args: string[]): CacheRequest {
  return {
    operation: args[0] as "get" | "stat" | "delete",
    key: context.required("cache", args, 1),
  };
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
  context.afterCommit(() => context.cache.release(item));
  return "";
}
async function gc(context: CommandContext) {
  expired(context).forEach((item) => context.cache.release(item));
  return JSON.stringify(await context.cache.gc());
}
