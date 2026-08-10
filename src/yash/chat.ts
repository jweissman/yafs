import { stdin } from "node:process";

import type { Readline } from "./repl";
import type { ChatClient, PersonaListing } from "./chatTypes";
import { ChatSessionOptions, runChatSession } from "./chatSession";
import { ChatArgs, parseChatArgs } from "./chatArgs";

export type { ChatClient };

export async function chat(
  client: ChatClient,
  readline: Readline,
  rest: string,
): Promise<string | undefined> {
  if (!stdin.isTTY) {
    return "agent chat requires an interactive terminal";
  }
  return beginAndRunChat(client, readline, parseChatArgs(rest));
}

async function beginAndRunChat(
  client: ChatClient,
  readline: Readline,
  args: ChatArgs,
): Promise<undefined> {
  const options = await sessionOptions(client, readline, args);
  await runChatSession(options);
  return undefined;
}

async function sessionOptions(
  client: ChatClient,
  readline: Readline,
  args: ChatArgs,
): Promise<ChatSessionOptions> {
  const personaPath = await beginChat(client, args.persona ?? "");
  const context = await resolveContext(client, args.contextPath);
  return { client, readline, personaPath, initialChatId: args.chatId, context };
}

export async function runChat(
  client: ChatClient,
  readline: Readline,
  rest: string,
) {
  await chat(client, readline, rest)
    .then(report)
    .catch((error: unknown) => report(errorMessage(error)));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function report(message: string | undefined) {
  if (message) {
    console.error(message);
  }
}

async function beginChat(client: ChatClient, personaArg: string) {
  const persona = personaArg || (await defaultPersona(client));
  const personaPath = await targetPath(client, persona);
  console.log(`Chatting with ${persona}. Type "exit" to leave.`);
  return personaPath;
}

async function defaultPersona(client: ChatClient): Promise<string> {
  const result = await client.execute("agent personas");
  const personas = JSON.parse(result.stdout) as PersonaListing[];
  return solePersona(personas);
}

function solePersona(personas: PersonaListing[]): string {
  if (personas.length === 0) {
    throw new Error("No agent personas configured");
  }
  if (personas.length === 1) {
    return personas[0].persona;
  }
  throw new Error(ambiguousMessage(personas));
}

function ambiguousMessage(personas: PersonaListing[]) {
  const names = personas.map((p) => `${p.mountPath}/${p.persona}`).join(", ");
  return `Multiple personas configured; specify one: ${names}`;
}

async function targetPath(
  client: ChatClient,
  persona: string,
): Promise<string> {
  const result = await client.execute(`agent target ${persona}`);
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.stdout;
}

async function resolveContext(
  client: ChatClient,
  path: string | undefined,
): Promise<string | undefined> {
  return path ? readContext(client, path) : undefined;
}

async function readContext(client: ChatClient, path: string) {
  const result = await client.execute(`cat ${path}`);
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.stdout;
}
