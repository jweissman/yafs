import type Yafs from "./index";
import { AbsolutePath } from "./core/AbsolutePath";
import { Command } from "./types/Command";
import { Word } from "./lang/Word";
import { yafsContext } from "./YafsContext";
import { evaluateWord, evaluateWordAsync } from "./lang/evaluate";
import { variable } from "./YafsValues";

export class YafsCommandRuntime {
  constructor(private readonly yafs: Yafs) {}

  handle(command: Command): string {
    const output = this.run(command.name, this.arguments(command));
    if (output instanceof Promise) {
      throw new Error(
        `Command requires asynchronous execution: ${command.name}`,
      );
    }
    return command.redirect
      ? this.redirect(command.redirect.target, output)
      : output;
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
      variable: (name: string) => variable(this.yafs, name),
      substitute: (nested: Command) => this.substitute(nested),
    };
    return command.args.map((word) => evaluateWord(word, evaluators));
  }

  private argumentsAsync(command: Command) {
    const evaluators = {
      variable: (name: string) => variable(this.yafs, name),
      substitute: (nested: Command) => this.substituteAsync(nested),
    };
    return Promise.all(
      command.args.map((word: Word) => evaluateWordAsync(word, evaluators)),
    );
  }

  private redirect(target: string, output: string): string {
    this.yafs.operationQueue.add({
      type: "write",
      path: this.yafs.shell.resolve(target),
      content: output,
    });
    return "";
  }

  private substitute(command: Command): string {
    const state = this.state();
    try {
      return this.handle(command).replace(/\n+$/, "");
    } finally {
      this.restore(state);
    }
  }

  private async substituteAsync(command: Command): Promise<string> {
    const state = this.state();
    try {
      return (await this.handleAsync(command)).replace(/\n+$/, "");
    } finally {
      this.restore(state);
    }
  }

  private state() {
    return {
      cwd: this.yafs.shell.pwd,
      operationState: this.yafs.operationQueue.count(),
    };
  }

  private restore(state: {
    cwd: AbsolutePath;
    operationState: { operations: number; effects: number };
  }) {
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
