import { randomUUID } from "node:crypto";

import { question } from "./question";
import { pollTurn } from "./chatPoll";
import type { Readline } from "./repl";
import type { ChatClient } from "./chatTypes";

type ChatSession = {
  client: ChatClient;
  readline: Readline;
  personaPath: string;
  chatId: string;
  interruption: AbortController;
  context?: string;
};

export type ChatSessionOptions = {
  client: ChatClient;
  readline: Readline;
  personaPath: string;
  initialChatId?: string;
  context?: string;
};

export async function runChatSession(options: ChatSessionOptions) {
  const session = newSession(options);
  await withSigintCleanup(session, () => chatTurns(session));
}

function newSession(options: ChatSessionOptions): ChatSession {
  const { client, readline, personaPath, initialChatId, context } = options;
  const base = { client, readline, personaPath, context };
  return {
    ...base,
    chatId: initialChatId ?? randomUUID(),
    interruption: new AbortController(),
  };
}

// Node's readline fires every registered SIGINT listener, not just the most
// recent one — merely adding our own would leave the outer REPL's listener
// active too, so Ctrl-C during chat would abort the outer session's
// controller as a side effect (the exact bug this whole function exists to
// avoid) once chat returns. Swap the outer listener(s) out for the duration
// instead, and restore them verbatim afterward.
async function withSigintCleanup(
  session: ChatSession,
  action: () => Promise<void>,
) {
  const readline = session.readline;
  const outer = swapOutSigint(readline);
  const onSigint = () => session.interruption.abort();
  readline.on("SIGINT", onSigint);
  await action().finally(() => restoreSigint(readline, onSigint, outer));
}

function restoreSigint(
  readline: Readline,
  onSigint: () => void,
  outer: (() => void)[],
) {
  readline.off("SIGINT", onSigint);
  outer.forEach((listener) => readline.on("SIGINT", listener));
}

function swapOutSigint(readline: Readline): (() => void)[] {
  const outer = readline.listeners("SIGINT") as (() => void)[];
  outer.forEach((listener) => readline.off("SIGINT", listener));
  return outer;
}

async function chatTurns(session: ChatSession) {
  let active = true;
  while (active) {
    active = await chatStep(session);
  }
}

async function chatStep(session: ChatSession): Promise<boolean> {
  const message = await promptMessage(session);
  if (!shouldContinue(message)) {
    return false;
  }
  await turnIfNonEmpty(session, message);
  return true;
}

function promptMessage(session: ChatSession) {
  return question(session.readline, "you> ", session.interruption);
}

function shouldContinue(message: string | undefined): message is string {
  return message !== undefined && message !== "exit" && message !== "quit";
}

function turnIfNonEmpty(session: ChatSession, message: string) {
  return message.trim() ? turn(session, message) : Promise.resolve();
}

async function turn(session: ChatSession, message: string) {
  const runId = randomUUID();
  const chatId = session.chatId;
  const context = session.context;
  session.context = undefined;
  const payload = JSON.stringify({ message, chatId, runId, context });
  await session.client.writeFile(`${session.personaPath}/ctl`, payload);
  const runPath = `${session.personaPath}/runs/${runId}`;
  finishLine(await pollTurn(session.client, runPath));
}

function finishLine(status: { state: string; error?: string }) {
  if (status.state === "failed") {
    console.log(`\n[failed: ${status.error}]`);
    return;
  }
  console.log();
}
