import { renderPrompt } from "./prompt";
import { question } from "./question";
import { print, printHistory } from "./output";
import { specialLine } from "./specialLine";
import type { Readline, Repl } from "./repl";
import type { AbsolutePath } from "../core/AbsolutePath";

type Session = { user: string; cwd: AbsolutePath };
type Client = Repl["client"];

export async function replLoop(repl: Repl) {
  let session = (await repl.client.execute("pwd")).session;
  const interruption = interruptionFor(repl.readline);
  let line: string | undefined;
  const next = () => nextCommand(repl, session, interruption);
  while ((line = await next()) !== undefined) {
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
  return exitCommand(line) ? undefined : line;
}

function exitCommand(line: string | undefined) {
  return line === undefined || line === "exit" || line === "quit";
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
  return handleCommandLine(repl, line, session);
}

async function handleCommandLine(repl: Repl, line: string, session: Session) {
  const special = specialLine(repl, line);
  if (special) {
    await special;
    return session;
  }
  return executeLine(repl, line, session);
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
