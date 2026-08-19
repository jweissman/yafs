export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
export type RunGit = (args: string[], cwd?: string) => Promise<GitResult>;
type GitProcess = Bun.Subprocess<"ignore", "pipe", "pipe">;

const INHERITED_ENV_KEYS = ["PATH", "HOME"];

export function bunRunGit(): RunGit {
  return (args, cwd) => spawned(args, cwd);
}

async function spawned(args: string[], cwd?: string): Promise<GitResult> {
  const proc: GitProcess = Bun.spawn(["git", ...args], {
    cwd,
    env: sanitizedEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await outcome(proc);
  return { stdout, stderr, exitCode };
}

function sanitizedEnv(): Record<string, string> {
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: "0" };
  for (const key of INHERITED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

async function outcome(proc: GitProcess) {
  return Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
}

export async function required(runGit: RunGit, args: string[], cwd?: string) {
  const result = await runGit(args, cwd);
  if (result.exitCode !== 0) {
    throw new Error(`git ${redacted(args).join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function redacted(args: string[]): string[] {
  return args.map((arg) =>
    arg.startsWith("http.extraheader=") ? "http.extraheader=<redacted>" : arg,
  );
}
