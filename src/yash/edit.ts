import { spawn } from "node:child_process";
import { basename, join } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { stdin } from "node:process";

import type { ExecutionResult } from "../types/ExecutionResult";

export type EditClient = {
  execute(command: string): Promise<ExecutionResult>;
  writeFile(path: string, content: string): Promise<ExecutionResult>;
};

export async function edit(
  client: EditClient,
  path: string,
): Promise<string | undefined> {
  if (!path) {
    return "edit requires a path";
  }
  if (!stdin.isTTY) {
    return "edit requires an interactive terminal";
  }
  return editFile(client, path);
}

export async function runEdit(client: EditClient, path: string) {
  try {
    const error = await edit(client, path);
    if (error) {
      console.error(error);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

async function editFile(
  client: EditClient,
  path: string,
): Promise<string | undefined> {
  const original = await readCurrent(client, path);
  const temporary = await stage(path, original);
  try {
    return await publish(client, path, original, temporary);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readCurrent(client: EditClient, path: string): Promise<string> {
  return currentContent(await client.execute(`cat ${path}`));
}

function currentContent(result: ExecutionResult): string {
  if (!result.error) {
    return result.stdout;
  }
  if (result.error.code === "not_found") {
    return "";
  }
  throw new Error(result.error.message);
}

async function stage(path: string, content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "yash-edit-"));
  const temporary = join(directory, basename(path) || "edit");
  await writeFile(temporary, content, "utf8");
  return temporary;
}

async function publish(
  client: EditClient,
  path: string,
  original: string,
  temporary: string,
) {
  const exitCode = await runEditor(temporary);
  return exitCode === 0
    ? afterEdit(client, path, original, temporary)
    : aborted();
}

async function afterEdit(
  client: EditClient,
  path: string,
  original: string,
  temporary: string,
) {
  const edited = await readFile(temporary, "utf8");
  return edited === original ? undefined : commit(client, path, edited);
}

function aborted() {
  return "edit aborted: editor exited with an error";
}

async function commit(
  client: EditClient,
  path: string,
  content: string,
): Promise<string | undefined> {
  const result = await client.writeFile(path, content);
  return result.error?.message;
}

function runEditor(temporary: string): Promise<number> {
  const [command, ...args] = editorCommand();
  return waitForExit(
    spawn(command, [...args, temporary], { stdio: "inherit" }),
  );
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function editorCommand(): string[] {
  return (process.env.VISUAL || process.env.EDITOR || "vi").trim().split(/\s+/);
}
