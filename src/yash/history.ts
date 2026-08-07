import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class CommandHistory {
  private constructor(
    private readonly path: string,
    private readonly limit: number,
    private lines: string[],
  ) {}

  static async open(path: string, limit = 1_000): Promise<CommandHistory> {
    return new CommandHistory(path, limit, await historyLines(path, limit));
  }

  entries(): string[] {
    return [...this.lines];
  }

  search(query: string): string | undefined {
    return [...this.lines].reverse().find((line) => line.includes(query));
  }

  async record(command: string): Promise<void> {
    if (!command || this.lines.at(-1) === command) {
      return;
    }
    this.lines.push(command);
    this.lines = this.lines.slice(-this.limit);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, this.lines.join("\n") + "\n", "utf8");
  }
}

async function historyLines(path: string, limit: number): Promise<string[]> {
  try {
    return (await readFile(path, "utf8"))
      .split("\n")
      .filter(Boolean)
      .slice(-limit);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
