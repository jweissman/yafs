import { type Socket } from "node:net";
import Yafs from "../index";
import { VfsOperation } from "../vfs/VfsOperation";
import { CtlDispatch } from "./CtlDispatch";
import { BackgroundDrivers } from "./BackgroundDrivers";
import { syncAll } from "./BackgroundDriversLifecycle";
import { compact, logAbort } from "./ServerConnectionLog";
import {
  attachLines,
  persistenceFailure,
  requestOrReject,
  respond,
  Request,
} from "./Framing";
import { planRequest } from "./ServerRequestPlanning";
import { Services } from "./ServerTypes";

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
    attachLines(socket, (line) => {
      this.enqueue(session, line, socket);
    });
  }

  private enqueue(session: Yafs, line: string, socket: Socket) {
    const run = () => this.executeLine(session, line, socket);
    this.queue = this.queue.then(run).catch((error: unknown) => {
      this.abort(error, socket);
    });
  }

  abort(error: unknown, socket: Socket) {
    logAbort(error);
    socket.destroy();
  }

  private async executeLine(session: Yafs, line: string, socket: Socket) {
    const request = requestOrReject(line, socket);
    if (request) {
      await this.guardedExecute(session, request, socket);
    }
  }

  private guardedExecute(session: Yafs, request: Request, socket: Socket) {
    return this.executeRequest(session, request, socket).catch(
      (error: unknown) => {
        respond(socket, persistenceFailure(request.id, error));
      },
    );
  }

  private async executeRequest(
    session: Yafs,
    request: Request,
    socket: Socket,
  ) {
    const plan = await planRequest(session, request);
    await this.commit(session, await this.ctl.intercept(plan.operations));
    respond(socket, { version: 1, id: request.id, result: plan.result });
  }

  async commit(session: Yafs, operations: VfsOperation[]) {
    await this.services.journal.commit(operations);
    session.apply(operations);
    syncAll(this.background());
    await compact(this.services.journal, this.services.store);
  }
}
