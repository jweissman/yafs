import { CommandAccess } from "./commands/BuiltinCommand";
import { assertAllowedStatements } from "./commands/AllowedCommands";
import { Command } from "./types/Command";
import { Program } from "./types/Program";
import { IfStatement, Statement } from "./types/Statement";

type Bindings = Record<string, string>;

export interface ScriptHost {
  handleAsync(command: Command): Promise<string>;
  bindScript(bindings?: Bindings): Bindings | undefined;
}

export async function runProgram(
  host: ScriptHost,
  program: Program,
  bindings: Bindings,
  allow?: CommandAccess[],
): Promise<string> {
  checkAllowed(program, allow);
  return withScriptBindings(host, bindings, program);
}

function checkAllowed(program: Program, allow?: CommandAccess[]) {
  if (allow) {
    assertAllowedStatements(program.statements, allow);
  }
}

function withScriptBindings(
  host: ScriptHost,
  bindings: Bindings,
  program: Program,
): Promise<string> {
  const previous = host.bindScript(bindings);
  return runStatements(host, program.statements).finally(() => {
    host.bindScript(previous);
  });
}

async function runStatements(
  host: ScriptHost,
  statements: Statement[],
): Promise<string> {
  const outputs: string[] = [];
  for (const statement of statements) {
    outputs.push(await runStatement(host, statement));
  }
  return outputs.filter((output) => output !== "").join("\n");
}

function runStatement(host: ScriptHost, statement: Statement): Promise<string> {
  return statement.kind === "if"
    ? runIf(host, statement)
    : host.handleAsync(statement);
}

async function runIf(
  host: ScriptHost,
  statement: IfStatement,
): Promise<string> {
  const conditionOutput = await host.handleAsync(statement.condition);
  const branch = conditionOutput === "true" ? statement.then : statement.else;
  return branch ? runStatements(host, branch) : "";
}
