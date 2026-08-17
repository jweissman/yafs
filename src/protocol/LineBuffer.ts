export class LineBuffer {
  constructor() {}
  private buffer = "";

  push(chunk: string) {
    this.buffer += chunk;
  }

  lines(): string[] {
    const lines: string[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      lines.push(this.takeLine(newline));
    }
    return lines.filter(Boolean);
  }

  private takeLine(newline: number): string {
    const line = this.buffer.slice(0, newline);
    this.buffer = this.buffer.slice(newline + 1);
    return line;
  }
}
