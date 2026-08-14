import { AgentConfig, PersonaConfig } from "../../mounts/types";
import { ModelClient } from "./ChatCompletionClient";
import { AgentRunStore, Status } from "./AgentRunStore";
import { AgentChatStore } from "./AgentChatStore";
import { AgentRunCancellation } from "./AgentRunCancellation";
import { AgentTarget, RunContext } from "./AgentTarget";
import { failedStatus, runningStatus } from "./AgentStatus";
import { AgentRequest, completeAgent } from "./AgentRequest";
import { deltaWriter } from "./AgentDeltaWriter";
import { chatHistoryFor, finishChatTurn } from "./AgentChatTurn";
import { completeWithTools, ToolServerUrl } from "./AgentToolCompletion";
import { ToolClientFor } from "./LmStudioMcpClient";

type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient;
export type AgentClients = {
  modelFor: ModelFor;
  toolClientFor: ToolClientFor;
  toolServerUrl: ToolServerUrl;
};

export class AgentRunExecutor {
  constructor(
    private readonly runs: AgentRunStore,
    private readonly chats: AgentChatStore,
    private readonly cancels: AgentRunCancellation,
    private readonly clients: AgentClients,
  ) {}

  settle(target: AgentTarget, context: RunContext, request: AgentRequest) {
    return this.startRun(context).then(() =>
      this.run(target, context, request),
    );
  }

  private run(target: AgentTarget, context: RunContext, request: AgentRequest) {
    return this.succeed(target, context, request).catch((error) =>
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
    await this.finishUnlessCancelled(context, request, reply);
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
    const { chats, runs } = this;
    const { toolClientFor } = this.clients;
    const deps = { chats, runs, toolClientFor };
    return completeWithTools(deps, { target, context, request });
  }

  private textCompletion(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    const model = this.clients.modelFor(target.persona, target.config);
    const onDelta = deltaWriter(this.runs, context);
    const history = chatHistoryFor(this.chats, context, request);
    return completeAgent(model, target.persona, request, onDelta, history);
  }

  private finishUnlessCancelled(
    context: RunContext,
    request: AgentRequest,
    reply: string,
  ) {
    if (this.cancels.cancelledRun(context.mountId, context.runId)) {
      return;
    }
    return this.finish(context, request, reply);
  }

  private async finish(
    context: RunContext,
    request: AgentRequest,
    reply: string,
  ) {
    // Append chat history before the "complete" status, not after — a
    // poller waiting on status.json reaching "complete" must be able to
    // trust the chat history is already durable by then.
    await finishChatTurn(this.chats, context, request.chatId, reply);
    await this.runs.finish({ ...context, message: request.message, reply });
  }

  private fail(context: RunContext, error: unknown) {
    return this.writeStatus(context, failedStatus(context.startedAt, error));
  }

  private writeStatus(context: RunContext, status: Status) {
    return this.runs.writeStatus(context, status);
  }
}
