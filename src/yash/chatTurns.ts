import { randomUUID } from "node:crypto";

import { pollTurn } from "./chatPoll";
import { question } from "./question";
import type { ChatSession } from "./chatSession";

export async function chatTurns(session: ChatSession) {
  let active = true;
  while (active) {
    active = await chatStep(session);
  }
}

async function chatStep(session: ChatSession): Promise<boolean> {
  const message = await prompted(session);
  if (!shouldContinue(message)) {
    return false;
  }
  await turnIfNonEmpty(session, message);
  return true;
}

function prompted(session: ChatSession) {
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
  const payload = requestPayload(session, message, runId);
  await session.client.writeFile(`${session.personaPath}/ctl`, payload);
  finishLine(
    await pollTurn(session.client, `${session.personaPath}/runs/${runId}`),
  );
}

function requestPayload(session: ChatSession, message: string, runId: string) {
  const { chatId, context } = session;
  session.context = undefined;
  return JSON.stringify({ message, chatId, runId, context });
}

function finishLine(status: { state: string; error?: string }) {
  console.log(status.state === "failed" ? `\n[failed: ${status.error}]` : "");
}
