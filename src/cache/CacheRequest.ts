export type CacheRequest =
  | { operation: "put"; key: string; value: string; ttlMs: number }
  | { operation: "get" | "stat" | "delete"; key: string }
  | { operation: "gc" };

export function validCacheRequest(value: unknown): value is CacheRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const request = value as Partial<CacheRequest>;
  return validOperation(request);
}

function validOperation(request: Partial<CacheRequest>) {
  if (request.operation === "gc") {
    return true;
  }
  if (request.operation === "put") {
    return validPut(request);
  }
  return validKeyedOperation(request);
}

function validKeyedOperation(request: { operation?: string; key?: unknown }) {
  return (
    ["get", "stat", "delete"].includes(request.operation || "") &&
    typeof request.key === "string"
  );
}

function validPut(
  request: Partial<Extract<CacheRequest, { operation: "put" }>>,
) {
  return (
    strings(request.key, request.value) && Number.isSafeInteger(request.ttlMs)
  );
}

function strings(...values: unknown[]) {
  return values.every((value) => typeof value === "string");
}
