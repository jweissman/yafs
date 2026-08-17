type OptionalNumber = number | undefined;
type OptionalString = string | undefined;

export function optionalNumber(value: unknown, name: string): OptionalNumber {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

export function assertPrompt(prompt: unknown): asserts prompt is string {
  if (typeof prompt !== "string" || !prompt) {
    throw new Error("Invalid persona prompt");
  }
}

export function optionalString(value: unknown, name: string): OptionalString {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !value) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}
