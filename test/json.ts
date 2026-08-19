export function parseJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}
