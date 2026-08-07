import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { homedir } from "node:os";
import { join } from "node:path";

import { CommandHistory } from "./yash/history";
import { completionToken } from "./yash/completion";
import { renderPrompt } from "./yash/prompt";
import { connect } from "./yash/connect";
import { edit } from "./yash/edit";
import { withTerminalHandoff } from "./yash/terminalHandoff";

const host = process.env.YAFS_HOST || "127.0.0.1";
const port = Number(process.env.YAFS_PORT || 7337);
const args = process.argv.slice(2);
const local = args[0] === "--local";
if (local) {
  args.shift();
}
const json = args[0] === "--json";
if (json) {
  args.shift();
}
const command = args[0] === "-c" ? args.slice(1).join(" ") : args.join(" ");
const promptTemplate =
  process.env.PROMPT || "\x1b[36m{user}@{server}\x1b[0m:\x1b[34m{cwd}\x1b[0m$ ";
const historyPath =
  process.env.YAFS_HISTORY ||
  join(homedir(), ".local", "state", "yafs", "history");
const connection = await connect(local, host, port);
const { client, server: serverName } = connection;

try {
  if (command) {
    const result = await client.execute(command);
    if (json) {
      console.log(JSON.stringify(result));
    } else {
      print(result.stdout);
      if (result.stderr) {
        console.error(result.stderr);
      }
      process.exitCode = result.status;
    }
  } else {
    const readline = createInterface({
      input: stdin,
      output: stdout,
      completer: async (line) => [
        await client.complete(line),
        completionToken(line),
      ],
    });
    const history = await CommandHistory.open(historyPath);
    historyInterface(readline).history = [...history.entries()].reverse();
    installReverseSearch(readline, history);
    let session = (await client.execute("pwd")).session;
    const interruption = new AbortController();
    readline.on("SIGINT", () => interruption.abort());
    while (true) {
      const prompt = renderPrompt(promptTemplate, session, serverName);
      const line = await question(readline, prompt, interruption);
      if (line === undefined) {
        break;
      }
      if (line === "exit" || line === "quit") {
        break;
      }
      if (line === "history") {
        history
          .entries()
          .forEach((entry, index) => console.log(`${index + 1}  ${entry}`));
        continue;
      }
      if (line === "edit" || line.startsWith("edit ")) {
        await history.record(line);
        await withTerminalHandoff(readline, () =>
          runEdit(client, line.slice(5).trim()),
        );
        continue;
      }
      try {
        await history.record(line);
        const result = await client.execute(line);
        session = result.session;
        print(result.stdout);
        if (result.stderr) {
          console.error(result.stderr);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
    readline.close();
  }
} finally {
  await client.close();
}

type Readline = ReturnType<typeof createInterface>;

async function question(
  readline: Readline,
  prompt: string,
  interruption: AbortController,
) {
  try {
    return await readline.question(prompt, { signal: interruption.signal });
  } catch (error) {
    if (interruption.signal.aborted) {
      return undefined;
    }
    throw error;
  }
}

function print(output: string) {
  if (output) {
    console.log(output);
  }
}

async function runEdit(client: Parameters<typeof edit>[0], path: string) {
  try {
    const error = await edit(client, path);
    if (error) {
      console.error(error);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

function installReverseSearch(
  readline: ReturnType<typeof createInterface>,
  history: CommandHistory,
) {
  if (!stdin.isTTY) {
    return;
  }
  emitKeypressEvents(stdin);
  stdin.on("keypress", (_text, key) => {
    if (key?.ctrl && key.name === "r") {
      replaceLine(readline, history.search(readline.line));
    }
  });
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

function historyInterface(readline: ReturnType<typeof createInterface>) {
  return readline as ReturnType<typeof createInterface> & { history: string[] };
}
