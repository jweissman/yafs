import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { AgentConfig, PersonaConfig } from "../../mounts/types";
import { ModelClient } from "./ChatCompletionClient";
import { AgentRunStore, Status } from "./AgentRunStore";
import { recoverAgentRuns } from "./AgentRunRecovery";
import { AgentRunCancellation, cancelId } from "./AgentRunCancellation";
import { AgentRegistration } from "./AgentRegistration";
import { AgentTarget, agentTarget, RunContext } from "./AgentTarget";
import { failedStatus, queuedStatus, runningStatus } from "./AgentStatus";
import { AgentRequest, completeAgent, parseAgentRequest } from "./AgentRequest";

type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
type UnregisterCtl = (path: AbsolutePath) => void;
type Ctl = { registerCtl: RegisterCtl; unregisterCtl: UnregisterCtl };
type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient;
type Enqueue = (work: () => Promise<void>) => Promise<void>;

export class AgentDirectoryDriver {
  private readonly runs: AgentRunStore;
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

  private acceptRun(context: RunContext, request: AgentRequest) {
    const status = queuedStatus(context.startedAt);
    return this.runs.accept(context, request.message, status, request.context);
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
    const reply = await completeAgent(
      this.modelFor(target.persona, target.config),
      target.persona,
      request,
    );
    await this.finishUnlessCancelled(context, request.message, reply);
  }

  private finishUnlessCancelled(
    context: RunContext,
    message: string,
    reply: string,
  ) {
    if (this.cancels.cancelledRun(context.mountId, context.runId)) {
      return;
    }
    return this.finish(context, message, reply);
  }

  private finish(context: RunContext, message: string, reply: string) {
    return this.runs.finish({ ...context, message, reply });
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
