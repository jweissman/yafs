import { CacheRequest } from "../cache/CacheRequest";
import { CommandContext } from "./CommandContext";
import { putRequest } from "./CachePut";

export function shellRequest(
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
