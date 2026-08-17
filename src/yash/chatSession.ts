import { randomUUID } from "node:crypto";

import { chatTurns } from "./chatTurns";
import type { Readline } from "./repl";
import type { ChatClient } from "./chatTypes";

export interface ChatSession {
  client: ChatClient;
  readline: Readline;
  personaPath: string;
  chatId: string;
  interruption: AbortController;
  context?: string;
}

export interface ChatSessionOptions {
  client: ChatClient;
  readline: Readline;
  personaPath: string;
  initialChatId?: string;
  context?: string;
}

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
  const onSigint = sigintHandler(session);
  readline.on("SIGINT", onSigint);
  await action().finally(cleanupSigint(readline, onSigint, outer));
}

function sigintHandler(session: ChatSession) {
  return () => {
    session.interruption.abort();
  };
}

function cleanupSigint(
  readline: Readline,
  onSigint: () => void,
  outer: (() => void)[],
) {
  return () => {
    restoreSigint(readline, onSigint, outer);
  };
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
