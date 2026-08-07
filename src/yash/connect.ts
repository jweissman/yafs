import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { join } from "node:path";

import { LocalYashClient } from "../protocol/local";
import { YashClient } from "../protocol/client";

type Client = LocalYashClient | YashClient;
type Connection = { client: Client; server: string };

export async function connect(
  local: boolean,
  host: string,
  port: number,
): Promise<Connection> {
  if (local) {
    return { client: new LocalYashClient(), server: "local" };
  }
  try {
    return await remote(host, port);
  } catch (error) {
    return recover(error, host, port);
  }
}

async function remote(host: string, port: number): Promise<Connection> {
  return {
    client: await YashClient.connect({ host, port }),
    server: `${host}:${port}`,
  };
}

async function recover(
  error: unknown,
  host: string,
  port: number,
): Promise<Connection> {
  if (!stdin.isTTY || !(await shouldStart(host, port))) {
    throw unavailable(error, host, port);
  }
  await start();
  return remote(host, port);
}

async function shouldStart(host: string, port: number): Promise<boolean> {
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

function unavailable(error: unknown, host: string, port: number): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Cannot reach yafsd at ${host}:${port}: ${detail}. Run yafsd start or yash --local.`,
  );
}
