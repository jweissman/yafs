import { AbsolutePath } from "../../core/AbsolutePath";
import { CtlHandler } from "../../protocol/CtlDispatch";
import { Journal } from "../../protocol/Journal";
import { MountManager } from "../../mounts/MountManager";
import { AgentConfig, PersonaConfig } from "../../mounts/types";
import { ModelClient } from "./ChatCompletionClient";
import { AgentRunStore } from "./AgentRunStore";
import { AgentChatStore } from "./AgentChatStore";
import { recoverAgentRuns } from "./AgentRunRecovery";
import { AgentRunCancellation, cancelId } from "./AgentRunCancellation";
import { AgentRegistration } from "./AgentRegistration";
import { AgentTarget, agentTarget, RunContext } from "./AgentTarget";
import { queuedStatus } from "./AgentStatus";
import { AgentRequest, parseAgentRequest } from "./AgentRequest";
import { acceptChatTurn } from "./AgentChatTurn";
import { AgentRunExecutor } from "./AgentRunExecutor";

type RegisterCtl = (path: AbsolutePath, handler: CtlHandler) => void;
type UnregisterCtl = (path: AbsolutePath) => void;
type Ctl = { registerCtl: RegisterCtl; unregisterCtl: UnregisterCtl };
type ModelFor = (persona: PersonaConfig, mount: AgentConfig) => ModelClient;
type Enqueue = (work: () => Promise<void>) => Promise<void>;

export class AgentDirectoryDriver {
  private runs: AgentRunStore;
  private chats: AgentChatStore;
  private cancels: AgentRunCancellation;
  private readonly registration: AgentRegistration;
  private executor: AgentRunExecutor;

  constructor(
    private readonly mounts: MountManager,
    journal: Journal,
    enqueue: Enqueue,
    ctl: Ctl,
    modelFor: ModelFor,
  ) {
    this.buildStores(journal, enqueue, modelFor);
    this.registration = this.buildRegistration(ctl);
  }

  private buildStores(journal: Journal, enqueue: Enqueue, modelFor: ModelFor) {
    this.runs = new AgentRunStore(this.mounts, journal, enqueue);
    this.chats = new AgentChatStore(this.mounts, journal, enqueue);
    this.cancels = new AgentRunCancellation(this.mounts, this.runs);
    this.executor = this.buildExecutor(modelFor);
  }

  private buildExecutor(modelFor: ModelFor) {
    return new AgentRunExecutor(this.runs, this.chats, this.cancels, modelFor);
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
    void this.executor.settle(target, context, request);
  }

  private async accept(
    mountId: string,
    personaName: string,
    request: AgentRequest,
  ): Promise<RunContext> {
    const context = this.newContext(mountId, personaName, request);
    await this.acceptRun(context, request);
    return context;
  }

  private newContext(
    mountId: string,
    personaName: string,
    request: AgentRequest,
  ): RunContext {
    const startedAt = new Date().toISOString();
    const runId = request.runId || startedAt.replace(/[:.]/g, "-");
    return { mountId, personaName, runId, startedAt };
  }

  private async acceptRun(context: RunContext, request: AgentRequest) {
    const status = queuedStatus(context.startedAt);
    await this.runs.accept(context, request.message, status, request.context);
    await acceptChatTurn(this.chats, context, request);
  }

  private persona(mountId: string, personaName: string): AgentTarget {
    return agentTarget(this.mounts, mountId, personaName);
  }
}
