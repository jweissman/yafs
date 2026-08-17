import { spawn } from "node:child_process";

export function runEditor(temporary: string): Promise<number> {
  const [command, ...args] = editorCommand();
  return waitForExit(
    spawn(command, [...args, temporary], { stdio: "inherit" }),
  );
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

function editorCommand(): string[] {
  return (process.env.VISUAL ?? process.env.EDITOR ?? "vi").trim().split(/\s+/);
}
