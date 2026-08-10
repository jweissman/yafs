import { type Socket } from "node:net";
import Yafs from "../index";
import { NodeStore } from "../vfs/NodeStore";
import { VfsOperation } from "../vfs/VfsOperation";
import { MountManager } from "../mounts/MountManager";
import { TraceService } from "../traces/TraceService";
import { CacheService } from "../cache/CacheService";
import { DesiredMounts as Desired } from "../mounts/DesiredMounts";
import { Journal } from "./Journal";
import { CtlDispatch } from "./CtlDispatch";
import { BackgroundDrivers, syncAll } from "./BackgroundDrivers";
import {
  attachLines,
  CommandRequest,
  isCacheRequest,
  isOperationRequest,
  isWriteRequest,
  persistenceFailure,
  requestOrReject,
  respond,
  Request,
  WriteRequest,
} from "./Framing";

type Services = {
  store: NodeStore;
  journal: Journal;
  mounts: MountManager;
  traces: TraceService;
  cache: CacheService;
  desired: Desired;
};

export class ServerConnection {
  private queue: Promise<void> = Promise.resolve();
  private sockets = new Set<Socket>();
  readonly ctl = new CtlDispatch();

  constructor(
    private readonly services: Services,
    private readonly background: () => BackgroundDrivers,
  ) {}

  attach(socket: Socket) {
    this.observe(socket);
    this.attachSession(socket, this.session());
  }
  closeSockets() {
    this.sockets.forEach((socket) => socket.destroy());
  }
  enqueueWork(work: () => Promise<void>) {
    this.queue = this.queue.then(work);
    return this.queue;
  }

  session() {
    const s = this.services;
    return new Yafs({
      store: s.store,
      mounts: s.mounts,
      traces: s.traces,
      cache: s.cache,
      desired: s.desired,
    });
  }

  private observe(socket: Socket) {
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
    socket.on("error", () => socket.destroy());
  }

  private attachSession(socket: Socket, session: Yafs) {
    socket.setEncoding("utf8");
    attachLines(socket, (line) => this.enqueue(session, line, socket));
  }

  private enqueue(session: Yafs, line: string, socket: Socket) {
    const run = () => this.executeLine(session, line, socket);
    this.queue = this.queue
      .then(run)
      .catch((error) => this.abort(error, socket));
  }

  abort(error: unknown, socket: Socket) {
    console.error("Unhandled command error:", error);
    socket.destroy();
  }

  private async executeLine(session: Yafs, line: string, socket: Socket) {
    const request = requestOrReject(line, socket);
    if (request) {
      await this.guardedExecute(session, request, socket);
    }
  }

  private guardedExecute(session: Yafs, request: Request, socket: Socket) {
    return this.executeRequest(session, request, socket).catch((error) =>
      respond(socket, persistenceFailure(request.id, error)),
    );
  }

  private async executeRequest(
    session: Yafs,
    request: Request,
    socket: Socket,
  ) {
    const plan = await this.plan(session, request);
    await this.commit(session, await this.ctl.intercept(plan.operations));
    respond(socket, { version: 1, id: request.id, result: plan.result });
  }

  private plan(session: Yafs, request: Request) {
    if (isCacheRequest(request)) {
      return session.planCache(request.cache);
    }
    if (isOperationRequest(request)) {
      return session.planOperationAsync(request.operation);
    }
    return this.planCommand(session, request as CommandRequest | WriteRequest);
  }

  private planCommand(session: Yafs, request: CommandRequest | WriteRequest) {
    return isWriteRequest(request)
      ? session.planWrite(request.write.path, request.write.content)
      : session.planAsync(request.command);
  }

  async commit(session: Yafs, operations: VfsOperation[]) {
    await this.services.journal.commit(operations);
    session.apply(operations);
    syncAll(this.background());
    try {
      await this.services.journal.compact(this.services.store);
    } catch (error) {
      console.error("Journal compaction failed:", error);
    }
  }
}
