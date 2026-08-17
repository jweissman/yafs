import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { CommandHistory } from "./history";
import { completionToken } from "./completion";
import { installReverseSearch, historyInterface } from "./reverseSearch";
import type { Client } from "./connect";

export type Readline = ReturnType<typeof createInterface>;
export interface Repl {
  client: Client;
  readline: Readline;
  history: CommandHistory;
  promptTemplate: string;
  serverName: string;
}

export async function setupRepl(
  client: Client,
  promptTemplate: string,
  serverName: string,
  historyPath: string,
): Promise<Repl> {
  const readline = readlineFor(client);
  const history = await attachedHistory(readline, historyPath);
  return { client, readline, history, promptTemplate, serverName };
}

async function attachedHistory(readline: Readline, historyPath: string) {
  const history = await CommandHistory.open(historyPath);
  attachHistory(readline, history);
  return history;
}

function attachHistory(readline: Readline, history: CommandHistory) {
  historyInterface(readline).history = [...history.entries()].reverse();
  installReverseSearch(readline, history);
}

function readlineFor(client: Client) {
  return createInterface({
    input: stdin,
    output: stdout,
    completer: completer(client),
  });
}

function completer(client: Client) {
  return async (line: string): Promise<[string[], string]> => [
    await client.complete(line),
    completionToken(line),
  ];
}
