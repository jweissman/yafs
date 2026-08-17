import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { YafsOptions } from "../../index";
import { LocalYashClient } from "../../protocol/local";
import { MountManager } from "../../mounts/MountManager";
import { ScopedMcpClient, ScopedMcpConfig } from "../../mcp/ScopedMcpClient";
import { badRequest, mcpServer, notFound } from "./AgentToolProtocol";
import { logSession } from "./AgentToolServerLog";
import { isAddressInUse } from "../../DaemonAddressError";
import { toolsPortInUseError } from "./AgentToolServerPort";
import { Identity, identityFrom, scopedConfig } from "./AgentToolServerScope";
import { AgentToolSessions } from "./AgentToolSessions";

export { toolsPort, DEFAULT_TOOLS_PORT } from "./AgentToolServerPort";

export class AgentToolServer {
  private readonly sessions = new AgentToolSessions();
  private readonly client: LocalYashClient;
  private bun?: ReturnType<typeof Bun.serve>;

  constructor(
    private readonly mounts: MountManager,
    yafsOptions: YafsOptions,
  ) {
    this.client = new LocalYashClient(yafsOptions);
  }

  // Defaults to an OS-assigned ephemeral port, safe for any caller,
  // including tests. Only `yafsd` opts into the fixed port (toolsPort()).
  start(port = 0) {
    if (!this.tryStart(port)) {
      throw toolsPortInUseError(port);
    }
  }

  private tryStart(port: number): boolean {
    try {
      return this.started(
        Bun.serve({ port, fetch: (req) => this.handle(req) }),
      );
    } catch (error) {
      return startFailure(error);
    }
  }

  private started(server: ReturnType<typeof Bun.serve>) {
    this.bun = server;
    return true;
  }

  close() {
    this.sessions.close();
    void this.bun?.stop();
  }

  urlFor(mountId: string, personaName: string): string {
    const port = this.port();
    if (!port) {
      throw new Error("Agent tool server is not running");
    }
    return `http://127.0.0.1:${port}/mcp/${mountId}/${personaName}`;
  }

  port(): number | undefined {
    return this.bun?.port;
  }

  private handle(req: Request): Promise<Response> {
    const identity = identityFrom(new URL(req.url).pathname);
    return identity ? this.route(req, identity) : Promise.resolve(notFound());
  }

  private async route(req: Request, identity: Identity): Promise<Response> {
    const sessionId = req.headers.get("mcp-session-id") ?? undefined;
    const existing = this.sessions.find(sessionId);
    if (existing) {
      return existing.handleRequest(req);
    }
    return req.method === "POST"
      ? this.startSession(req, identity)
      : badRequest();
  }

  private async startSession(req: Request, identity: Identity) {
    const body: unknown = await req.json().catch(() => undefined);
    if (!isInitializeRequest(body)) {
      return badRequest();
    }
    const config = scopedConfig(this.mounts, identity);
    logSession(identity, Boolean(config));
    return config ? this.initSession(config, body, req) : notFound();
  }

  private async initSession(
    config: ScopedMcpConfig,
    body: unknown,
    req: Request,
  ) {
    const scoped = new ScopedMcpClient(this.client, config);
    const transport = this.sessions.create();
    await mcpServer(scoped).connect(transport);
    return transport.handleRequest(req, { parsedBody: body });
  }
}

function startFailure(error: unknown): false {
  if (isAddressInUse(error)) {
    return false;
  }
  throw error;
}
