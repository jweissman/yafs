import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";

import { LocalYashClient } from "../protocol/local";
import { YashClient } from "../protocol/client";

export type Client = LocalYashClient | YashClient;
type Connection = { client: Client; server: string };
type Address = { host: string; port: number };

export async function connect(
  local: boolean,
  address: Address,
): Promise<Connection> {
  return local
    ? { client: new LocalYashClient(), server: "local" }
    : connectRemote(address);
}

async function connectRemote(address: Address): Promise<Connection> {
  try {
    return await remote(address);
  } catch (error) {
    return recover(error, address);
  }
}

async function remote(address: Address): Promise<Connection> {
  return {
    client: await YashClient.connect(address),
    server: `${address.host}:${address.port}`,
  };
}

async function recover(error: unknown, address: Address): Promise<Connection> {
  if (!stdin.isTTY || !(await shouldStart(address))) {
    throw unavailable(error, address);
  }
  await start();
  return remote(address);
}

async function shouldStart({ host, port }: Address): Promise<boolean> {
  const readline = createInterface({ input: stdin, output: stdout });
  const answer = await readline.question(
    `yafsd is unavailable at ${host}:${port}. Start it? [Y/n] `,
  );
  readline.close();
  return answer.trim().toLowerCase() !== "n";
}

async function start() {
  const child = spawn(
    process.execPath,
    [join(import.meta.dir, "..", "yafsd.ts"), "start"],
    { stdio: "inherit" },
  );
  if ((await exitCode(child)) !== 0) {
    throw new Error("yafsd failed to start");
  }
}

function exitCode(child: ReturnType<typeof spawn>) {
  return new Promise<number>((resolve) =>
    child.once("exit", (code) => resolve(code || 0)),
  );
}

function unavailable(error: unknown, { host, port }: Address): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Cannot reach yafsd at ${host}:${port}: ${detail}. Run yafsd start or yash --local.`,
  );
}
