import { stdin } from "node:process";

import type { Readline } from "./repl";
import type { ChatClient, PersonaListing } from "./chatTypes";
import { runChatSession } from "./chatSession";

export type { ChatClient };

export async function chat(
  client: ChatClient,
  readline: Readline,
  personaArg: string,
): Promise<string | undefined> {
  if (!stdin.isTTY) {
    return "agent chat requires an interactive terminal";
  }
  return beginAndRunChat(client, readline, personaArg);
}

async function beginAndRunChat(
  client: ChatClient,
  readline: Readline,
  personaArg: string,
): Promise<undefined> {
  const personaPath = await beginChat(client, personaArg);
  await runChatSession(client, readline, personaPath);
  return undefined;
}

export async function runChat(
  client: ChatClient,
  readline: Readline,
  personaArg: string,
) {
  await chat(client, readline, personaArg)
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
