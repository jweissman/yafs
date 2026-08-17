// Test fixtures declare the narrow shape they intend to assert after JSON
// parsing. Production parsers must validate external values independently.
export function parseJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}
