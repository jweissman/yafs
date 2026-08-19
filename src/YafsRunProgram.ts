import type Yafs from "./index";
import { CommandAccess } from "./commands/BuiltinCommand";
import { AbsolutePath } from "./core/AbsolutePath";

export interface ScriptRequest {
  path: AbsolutePath;
  args: string[];
  allow?: CommandAccess[];
}

export function runScript(yafs: Yafs, request: ScriptRequest): Promise<string> {
  const content = yafs.workspace.read(request.path);
  const program = yafs.interpreter.parseProgram(content);
  const bindings = positionalBindings(request.args);
  return yafs.commands.runProgram(program, bindings, request.allow);
}

function positionalBindings(args: string[]): Record<string, string> {
  return Object.fromEntries(
    args.map((value, index) => [String(index + 1), value]),
  );
}
