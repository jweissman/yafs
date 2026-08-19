import type Yafs from "./index";
import { CommandAccess } from "./commands/BuiltinCommand";
import { Command } from "./types/Command";
import { Program } from "./types/Program";
import { Word } from "./lang/Word";
import { yafsContext } from "./YafsContext";
import { evaluateWord, evaluateWordAsync } from "./lang/evaluate";
import { variable } from "./YafsValues";
import { runProgram as runScript } from "./YafsScriptRuntime";
import {
  RuntimeSnapshot,
  substitute,
  substituteAsync,
} from "./YafsSubstitution";

export class YafsCommandRuntime {
  private scriptBindings?: Record<string, string>;

  constructor(private readonly yafs: Yafs) {}

  runProgram(
    program: Program,
    bindings: Record<string, string>,
    allow?: CommandAccess[],
  ) {
    return runScript(this, program, bindings, allow);
  }

  bindScript(
    bindings?: Record<string, string>,
  ): Record<string, string> | undefined {
    const previous = this.scriptBindings;
    this.scriptBindings = bindings;
    return previous;
  }

  handle(command: Command): string {
    const output = this.syncOutput(command);
    return command.redirect
      ? this.redirect(command.redirect.target, output)
      : output;
  }

  private syncOutput(command: Command): string {
    const output = this.run(command.name, this.arguments(command));
    if (output instanceof Promise) {
      throw new Error(
        `Command requires asynchronous execution: ${command.name}`,
      );
    }
    return output;
  }

  async handleAsync(command: Command): Promise<string> {
    const output = await this.run(
      command.name,
      await this.argumentsAsync(command),
    );
    return command.redirect
      ? this.redirect(command.redirect.target, output)
      : output;
  }

  private arguments(command: Command) {
    const evaluators = {
      variable: (name: string) => this.resolveVariable(name),
      substitute: (nested: Command) => substitute(this, nested),
    };
    return command.args.map((word) => evaluateWord(word, evaluators));
  }

  private argumentsAsync(command: Command) {
    const evaluators = {
      variable: (name: string) => this.resolveVariable(name),
      substitute: (nested: Command) => substituteAsync(this, nested),
    };
    return Promise.all(
      command.args.map((word: Word) => evaluateWordAsync(word, evaluators)),
    );
  }

  private resolveVariable(name: string): string {
    return this.scriptBindings?.[name] ?? variable(this.yafs, name);
  }

  private redirect(target: string, output: string): string {
    this.yafs.operationQueue.add({
      type: "write",
      path: this.yafs.shell.resolve(target),
      content: output,
    });
    return "";
  }

  snapshot(): RuntimeSnapshot {
    return {
      cwd: this.yafs.shell.pwd,
      operationState: this.yafs.operationQueue.count(),
    };
  }

  restore(state: RuntimeSnapshot) {
    this.yafs.shell.enter(state.cwd);
    this.yafs.operationQueue.restore(state.operationState);
  }

  private run(name: string, args: string[]): string | Promise<string> {
    const command = this.yafs.builtins.get(name);
    if (!command) {
      throw new Error(`Unknown command: ${name}`);
    }
    return command.execute(yafsContext(this.yafs), args);
  }
}
