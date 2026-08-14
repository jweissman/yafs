import { stat } from "node:fs/promises";

const POLL_MS = 300;
const DEFAULT_LINES = 50;

export async function printLogs(
  path: string,
  args: string[],
  signal?: AbortSignal,
): Promise<void> {
  const offset = await printRecent(path, linesFlag(args));
  if (tailFlag(args)) {
    await follow(path, offset, signal);
  }
}

function tailFlag(args: string[]): boolean {
  return args.includes("--tail") || args.includes("-f");
}

function linesFlag(args: string[]): number {
  const index = args.findIndex((arg) => arg === "-n" || arg === "--lines");
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_LINES;
}

async function printRecent(path: string, count: number): Promise<number> {
  const content = await readOrEmpty(path);
  process.stdout.write(lastLines(content, count));
  return Buffer.byteLength(content, "utf8");
}

async function readOrEmpty(path: string): Promise<string> {
  try {
    return await Bun.file(path).text();
  } catch {
    return "";
  }
}

function lastLines(content: string, count: number): string {
  if (!content) {
    return "";
  }
  const lines = content.split("\n");
  const complete = lines.at(-1) === "" ? lines.slice(0, -1) : lines;
  return `${complete.slice(-count).join("\n")}\n`;
}

// `signal` exists purely for tests to bound this otherwise-infinite loop;
// `yafsd logs --tail` relies on Ctrl-C to stop, same as any other `tail -f`.
async function follow(path: string, offset: number, signal?: AbortSignal) {
  announceFollowing(path);
  let position = offset;
  while (!signal?.aborted) {
    position = await tick(path, position);
  }
}

function announceFollowing(path: string) {
  process.stderr.write(`-- tailing ${path}; Ctrl-C to stop --\n`);
}

async function tick(path: string, position: number): Promise<number> {
  const next = await emitGrowth(path, position);
  await sleep(POLL_MS);
  return next;
}

export async function emitGrowth(
  path: string,
  position: number,
): Promise<number> {
  const size = await sizeOrZero(path);
  if (size < position) {
    return 0;
  }
  return size > position ? emitFrom(path, position, size) : position;
}

async function emitFrom(
  path: string,
  position: number,
  size: number,
): Promise<number> {
  const chunk = await Bun.file(path).slice(position, size).text();
  process.stdout.write(chunk);
  return size;
}

async function sizeOrZero(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
