import { runEdit } from "./edit";
import { runChat } from "./chat";
import { withTerminalHandoff } from "./terminalHandoff";
import type { Repl } from "./repl";

export function specialLine(
  repl: Repl,
  line: string,
): Promise<void> | undefined {
  if (line === "edit" || line.startsWith("edit ")) {
    return editLine(repl, line);
  }
  return chatOrUndefined(repl, line);
}

function chatOrUndefined(repl: Repl, line: string) {
  return line === "agent chat" || line.startsWith("agent chat ")
    ? chatLine(repl, line)
    : undefined;
}

async function editLine(repl: Repl, line: string) {
  await repl.history.record(line);
  await withTerminalHandoff(repl.readline, () =>
    runEdit(repl.client, line.slice(5).trim()),
  );
}

async function chatLine(repl: Repl, line: string) {
  await repl.history.record(line);
  const rest = line.slice("agent chat".length).trim();
  await runChat(repl.client, repl.readline, rest);
}
