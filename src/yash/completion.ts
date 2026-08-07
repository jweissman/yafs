export function completionToken(line: string): string {
  return line.trimEnd().split(/\s+/).at(-1) || "";
}
