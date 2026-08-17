import { homedir } from "node:os";
import { join } from "node:path";

export function cliOptions() {
  const args = process.argv.slice(2);
  const local = takeFlag(args, "--local");
  const json = takeFlag(args, "--json");
  const command = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
  return { local, json, command, ...connectionDefaults(), ...replDefaults() };
}

function connectionDefaults() {
  return {
    host: process.env.YAFS_HOST ?? "127.0.0.1",
    port: Number(process.env.YAFS_PORT ?? 7337),
  };
}

function replDefaults() {
  return {
    promptTemplate:
      process.env.PROMPT ??
      "\x1b[36m{user}@{server}\x1b[0m:\x1b[34m{cwd}\x1b[0m$ ",
    historyPath:
      process.env.YAFS_HISTORY ??
      join(homedir(), ".local", "state", "yafs", "history"),
  };
}

function takeFlag(args: string[], flag: string) {
  const present = args[0] === flag;
  if (present) {
    args.shift();
  }
  return present;
}
