import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin } from "node:process";

import { CommandHistory } from "./history";

export function installReverseSearch(
  readline: ReturnType<typeof createInterface>,
  history: CommandHistory,
) {
  if (!stdin.isTTY) {
    return;
  }
  emitKeypressEvents(stdin);
  listenForSearch(readline, history);
}

function listenForSearch(
  readline: ReturnType<typeof createInterface>,
  history: CommandHistory,
) {
  stdin.on("keypress", (_text, key) => {
    onKeypress(readline, history, keyFor(key));
  });
}

function keyFor(value: unknown): { ctrl: boolean; name: string } | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const key = value as { ctrl?: unknown; name?: unknown };
  return typeof key.ctrl === "boolean" && typeof key.name === "string"
    ? { ctrl: key.ctrl, name: key.name }
    : undefined;
}

function onKeypress(
  readline: ReturnType<typeof createInterface>,
  history: CommandHistory,
  key?: { ctrl: boolean; name: string },
) {
  if (key?.ctrl && key.name === "r") {
    replaceLine(readline, history.search(readline.line));
  }
}

function replaceLine(
  readline: ReturnType<typeof createInterface>,
  line: string | undefined,
) {
  if (!line) {
    return;
  }
  readline.write(null, { ctrl: true, name: "u" });
  readline.write(line);
}

export function historyInterface(readline: ReturnType<typeof createInterface>) {
  return readline as ReturnType<typeof createInterface> & { history: string[] };
}
