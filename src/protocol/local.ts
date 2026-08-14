import Yafs, { YafsOptions } from "../index";
import type { ExecutionResult } from "../types/ExecutionResult";
import { completionTarget } from "./CompletionTarget";
import { WorkspaceOperation } from "../operations/WorkspaceOperation";

export class LocalYashClient {
  private readonly yafs: Yafs;

  constructor(options: YafsOptions = {}) {
    this.yafs = new Yafs(options);
  }

  async execute(command: string): Promise<ExecutionResult> {
    return this.yafs.executeAsync(command);
  }
  async operation(request: WorkspaceOperation): Promise<ExecutionResult> {
    const plan = await this.yafs.planOperationAsync(request);
    if (!plan.result.error) {
      this.yafs.apply(plan.operations);
    }
    return plan.result;
  }
  async writeFile(path: string, content: string): Promise<ExecutionResult> {
    return this.yafs.executeWrite(path, content);
  }

  async exec(command: string): Promise<string> {
    const result = await this.execute(command);
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.stdout;
  }

  async complete(input: string): Promise<string[]> {
    const target = completionTarget(input);
    const result = await this.execute(`ls ${target.directory}`);
    return result.error
      ? []
      : result.stdout
          .split("\n")
          .filter((name) => name.startsWith(target.prefix))
          .map(target.format);
  }

  async close() {}
}
