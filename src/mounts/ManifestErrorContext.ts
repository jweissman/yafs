export function mountLabel(value: unknown, index: number): string {
  const id = idOf(value);
  return id ? `"${id}" (position ${index + 1})` : `at position ${index + 1}`;
}

function idOf(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
