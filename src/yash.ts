import { renderPrompt } from "./yash/prompt";
import { connect } from "./yash/connect";
import { runEdit } from "./yash/edit";
import { runChat } from "./yash/chat";
import { withTerminalHandoff } from "./yash/terminalHandoff";
import { question } from "./yash/question";
import { print, printHistory } from "./yash/output";
import { cliOptions } from "./yash/cliOptions";
import { setupRepl } from "./yash/repl";
import type { Readline, Repl } from "./yash/repl";
import type { AbsolutePath } from "./core/AbsolutePath";

type Session = { user: string; cwd: AbsolutePath };

const options = cliOptions();
const connection = await connect(options.local, {
  host: options.host,
  port: options.port,
});
const { client, server: serverName } = connection;

try {
  if (options.command) {
    await runOnce(client, options.command, options.json);
  } else {
    await runInteractive(
      client,
      options.promptTemplate,
      serverName,
      options.historyPath,
    );
  }
} finally {
  await client.close();
}

type Client = Repl["client"];

async function runOnce(client: Client, command: string, json: boolean) {
  const result = await client.execute(command);
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  print(result.stdout);
  if (result.stderr) {
    console.error(result.stderr);
  }
  process.exitCode = result.status;
}

async function runInteractive(
  client: Client,
  promptTemplate: string,
  serverName: string,
  historyPath: string,
) {
  const repl = await setupRepl(client, promptTemplate, serverName, historyPath);
  await replLoop(repl);
  repl.readline.close();
}

async function replLoop(repl: Repl) {
  let session = (await repl.client.execute("pwd")).session;
  const interruption = interruptionFor(repl.readline);
  while (true) {
    const line = await nextCommand(repl, session, interruption);
    if (line === undefined) {
      return;
    }
    session = await handleLine(repl, line, session);
  }
}

async function nextCommand(
  repl: Repl,
  session: Session,
  interruption: AbortController,
) {
  const prompt = renderPrompt(repl.promptTemplate, session, repl.serverName);
  const line = await question(repl.readline, prompt, interruption);
  return line === undefined || line === "exit" || line === "quit"
    ? undefined
    : line;
}

function interruptionFor(readline: Readline) {
  const interruption = new AbortController();
  readline.on("SIGINT", () => interruption.abort());
  return interruption;
}

async function handleLine(repl: Repl, line: string, session: Session) {
  if (line === "history") {
    printHistory(repl.history);
    return session;
  }
  const special = specialLine(repl, line);
  if (special) {
    await special;
    return session;
  }
  return executeLine(repl, line, session);
}

function specialLine(repl: Repl, line: string): Promise<void> | undefined {
  if (line === "edit" || line.startsWith("edit ")) {
    return editLine(repl, line);
  }
  if (line === "agent chat" || line.startsWith("agent chat ")) {
    return chatLine(repl, line);
  }
  return undefined;
}

async function editLine(repl: Repl, line: string) {
  await repl.history.record(line);
  await withTerminalHandoff(repl.readline, () =>
    runEdit(repl.client, line.slice(5).trim()),
  );
}

async function chatLine(repl: Repl, line: string) {
  await repl.history.record(line);
  const persona = line.slice("agent chat".length).trim();
  await runChat(repl.client, repl.readline, persona);
}

async function executeLine(repl: Repl, line: string, session: Session) {
  try {
    await repl.history.record(line);
    return await executedSession(repl.client, line);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return session;
  }
}

async function executedSession(client: Client, line: string) {
  const result = await client.execute(line);
  print(result.stdout);
  if (result.stderr) {
    console.error(result.stderr);
  }
  return result.session;
}
