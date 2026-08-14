import { createServer, type Server } from "node:net";
import { AbsolutePath } from "../core/AbsolutePath";
import { VfsOperation } from "../vfs/VfsOperation";
import { openServices, listen } from "./ServerServices";
import { CtlHandler } from "./CtlDispatch";
import { commitBackground, serverAddress } from "./ServerIntrospection";
import { BackgroundDrivers } from "./BackgroundDrivers";
import { startAll, closeAll, recoverAll } from "./BackgroundDriversLifecycle";
import { AgentToolServer } from "../plugins/agent/AgentToolServer";
import { toolServerOptions } from "./ServerClients";
import { daemonDesiredMounts } from "../mounts/daemonDesiredMounts";
import { reconcileDesired } from "./ReconcileDesired";
import { ServerConnection } from "./ServerConnection";
import { Services, StartOptions } from "./ServerTypes";
import { driversFor, ServerBindings } from "./ServerWiring";

export type { StartOptions } from "./ServerTypes";

export class YafsServer {
  private readonly server: Server;
  private readonly connection: ServerConnection;
  private readonly toolServer: AgentToolServer;
  private background!: BackgroundDrivers;
  private constructor(private readonly services: Services) {
    this.connection = new ServerConnection(services, () => this.background);
    this.server = createServer((socket) => this.connection.attach(socket));
    const options = toolServerOptions(services);
    this.toolServer = new AgentToolServer(services.mounts, options);
  }
  private driversFor(options: StartOptions) {
    return driversFor(this.bindings(), options);
  }
  private bindings(): ServerBindings {
    return {
      services: this.services,
      connection: this.connection,
      toolServer: this.toolServer,
      registerCtl: this.registerCtl.bind(this),
      unregisterCtl: this.unregisterCtl.bind(this),
      dispatchCtl: this.dispatchCtl.bind(this),
    };
  }
  static async start(options: StartOptions): Promise<YafsServer> {
    const s = YafsServer.construct(await openServices(options), options);
    s.toolServer.start(options.toolsPort);
    const bg = s.background;
    await recoverAll(bg);
    await s.reconcile();
    await listen(s.server, options);
    startAll(bg);
    return s;
  }
  private reconcile() {
    const commit = this.connection.commit.bind(this.connection);
    return reconcileDesired(
      this.services.desired,
      () => this.connection.session(),
      commit,
    );
  }
  private static construct(
    services: Awaited<ReturnType<typeof openServices>>,
    options: StartOptions,
  ) {
    const desired = daemonDesiredMounts(services.mounts, options);
    const server = new YafsServer({ ...services, desired });
    server.background = server.driversFor(options);
    return server;
  }
  address(): { host: string; port: number } {
    return serverAddress(this.server);
  }
  agentToolsPort(): number | undefined {
    return this.toolServer.port();
  }
  async close(): Promise<void> {
    this.toolServer.close();
    closeAll(this.background);
    this.connection.closeSockets();
    await new Promise<void>((ok, no) =>
      this.server.close((error) => (error ? no(error) : ok())),
    );
    await this.services.journal.close();
  }

  registerCtl(path: AbsolutePath, handler: CtlHandler) {
    this.connection.ctl.register(path, handler);
  }
  unregisterCtl(path: AbsolutePath) {
    this.connection.ctl.unregister(path);
  }
  dispatchCtl(path: AbsolutePath, payload: string) {
    return this.connection.ctl.invoke(path, payload);
  }

  async refreshDue() {
    return this.background.refreshes.due();
  }
  commitBackground(operations: VfsOperation[]): Promise<void> {
    const enqueue = (work: () => Promise<void>) =>
      this.connection.enqueueWork(work);
    return commitBackground(this.services, enqueue, operations);
  }
}
