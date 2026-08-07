import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { AgentConfig, PersonaConfig } from "../../mounts/types";
import { ModelClient } from "./ChatCompletionClient";
import { AgentRunStore, Status } from "./AgentRunStore";
import { AgentChatStore } from "./AgentChatStore";
import { recoverAgentRuns } from "./AgentRunRecovery";
import { AgentRunCancellation, cancelId } from "./AgentRunCancellation";
import { AgentRegistration } from "./AgentRegistration";
import { AgentTarget, agentTarget, RunContext } from "./AgentTarget";
import { failedStatus, queuedStatus, runningStatus } from "./AgentStatus";
import { AgentRequest, completeAgent, parseAgentRequest } from "./AgentRequest";
import { deltaWriter } from "./AgentDeltaWriter";
import { acceptChatTurn, chatHistoryFor, finishChatTurn } from "./AgentChatTurn";

type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
type UnregisterCtl = (path: AbsolutePath) => void;
type Ctl = { registerCtl: RegisterCtl; unregisterCtl: UnregisterCtl };
type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient;
type Enqueue = (work: () => Promise<void>) => Promise<void>;

export class AgentDirectoryDriver {
  private readonly runs: AgentRunStore;
  private readonly chats: AgentChatStore;
  private readonly cancels: AgentRunCancellation;
  private readonly registration: AgentRegistration;

  constructor(
    private readonly mounts: MountManager,
    journal: Journal,
    enqueue: Enqueue,
    ctl: Ctl,
    private readonly modelFor: ModelFor,
  ) {
    this.runs = new AgentRunStore(mounts, journal, enqueue);
    this.chats = new AgentChatStore(mounts, journal, enqueue);
    this.cancels = new AgentRunCancellation(mounts, this.runs);
    this.registration = this.buildRegistration(ctl);
  }

  private buildRegistration({ registerCtl, unregisterCtl }: Ctl) {
    const invoke = (mountId: string, name: string, payload: string) =>
      this.invoke(mountId, name, payload);
    return new AgentRegistration(
      this.mounts,
      registerCtl,
      unregisterCtl,
      invoke,
    );
  }

  close() {
    this.registration.close();
  }
  async recover() {
    return recoverAgentRuns(this.mounts, this.runs);
  }
  sync() {
    this.registration.sync();
  }

  private async invoke(mountId: string, personaName: string, payload: string) {
    const cancellation = cancelId(payload);
    if (cancellation) {
      return this.cancels.cancel(mountId, personaName, cancellation);
    }
    return this.invokeMessage(mountId, personaName, payload);
  }

  private async invokeMessage(
    mountId: string,
    personaName: string,
    payload: string,
  ) {
    const request = parseAgentRequest(payload);
    const target = this.persona(mountId, personaName);
    const context = await this.accept(mountId, personaName, request);
    void this.settle(target, context, request);
  }

  private async accept(
    mountId: string,
    personaName: string,
    request: AgentRequest,
  ): Promise<RunContext> {
    const startedAt = new Date().toISOString();
    const runId = request.runId || startedAt.replace(/[:.]/g, "-");
    const context = { mountId, personaName, runId, startedAt };
    await this.acceptRun(context, request);
    return context;
  }

  private async acceptRun(context: RunContext, request: AgentRequest) {
    const status = queuedStatus(context.startedAt);
    await this.runs.accept(context, request.message, status, request.context);
    await acceptChatTurn(this.chats, context, request);
  }

  private settle(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    return this.startRun(context).then(() =>
      this.run(target, context, request),
    );
  }

  private async run(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    try {
      await this.succeed(target, context, request);
    } catch (error) {
      await this.fail(context, error);
    }
  }

  private startRun(context: RunContext) {
    return this.writeStatus(context, runningStatus(context.startedAt));
  }

  private async succeed(
    target: AgentTarget,
    context: RunContext,
    request: AgentRequest,
  ) {
    const model = this.modelFor(target.persona, target.config);
    const onDelta = deltaWriter(this.runs, context);
    const history = chatHistoryFor(this.chats, context, request);
    const reply = await completeAgent(model, target.persona, request, onDelta, history);
    await this.finishUnlessCancelled(context, request, reply);
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

  private async finish(context: RunContext, request: AgentRequest, reply: string) {
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

  private persona(mountId: string, personaName: string): AgentTarget {
    return agentTarget(this.mounts, mountId, personaName);
  }
}
