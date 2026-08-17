import { MountManager } from "../../mounts/MountManager";
import { AgentRunStore, Status } from "./AgentRunStore";
import { AgentChatStore } from "./AgentChatStore";
import { AgentRunCancellation } from "./AgentRunCancellation";
import { AgentTarget, RunContext } from "./AgentTarget";
import { failedStatus, runningStatus } from "./AgentStatus";
import { AgentRequest } from "./AgentRequest";
import { completeWithTools, ToolServerUrl } from "./AgentToolCompletion";
import { ToolClientFor } from "./LmStudioMcpClient";
import { ModelFor, textCompletion } from "./AgentTextCompletion";
import { finishAgentRun } from "./AgentRunFinisher";
import { logRun } from "./AgentRunLog";

export interface AgentClients {
  modelFor: ModelFor;
  toolClientFor: ToolClientFor;
  toolServerUrl: ToolServerUrl;
}

export interface AgentRunDependencies {
  runs: AgentRunStore;
  chats: AgentChatStore;
  cancels: AgentRunCancellation;
  clients: AgentClients;
  mounts: MountManager;
}

export class AgentRunExecutor {
  constructor(private readonly dependencies: AgentRunDependencies) {}

  settle(target: AgentTarget, context: RunContext, request: AgentRequest) {
    return this.startRun(context).then(() =>
      this.run(target, context, request),
    );
  }

  private run(target: AgentTarget, context: RunContext, request: AgentRequest) {
    return this.succeed(target, context, request).catch((error: unknown) =>
      this.fail(context, error),
    );
  }

  private startRun(context: RunContext) {
    return this.writeStatus(context, runningStatus(context.startedAt));
  }

  private async succeed(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    const reply = await this.completion(target, context, request);
    await finishAgentRun(this.dependencies, context, request, reply);
    logRun(context, "complete");
  }

  private completion(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    return target.persona.tools
      ? this.toolCompletion(target, context, request)
      : this.textCompletion(target, context, request);
  }

  private toolCompletion(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    const { chats, runs, mounts, clients } = this.dependencies;
    const { toolClientFor } = clients;
    const deps = { chats, runs, toolClientFor, mounts };
    return completeWithTools(deps, { target, context, request });
  }

  private textCompletion(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    const deps = textDependencies(this.dependencies);
    return textCompletion(deps, target, context, request);
  }

  private fail(context: RunContext, error: unknown) {
    logRun(context, "failed", error);
    return this.writeStatus(context, failedStatus(context.startedAt, error));
  }

  private writeStatus(context: RunContext, status: Status) {
    return this.dependencies.runs.writeStatus(context, status);
  }
}

function textDependencies(dependencies: AgentRunDependencies) {
  const { clients, runs, chats } = dependencies;
  return { modelFor: clients.modelFor, runs, chats };
}
