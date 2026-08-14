import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport as HttpTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { YafsOptions } from "../../index";
import { LocalYashClient } from "../../protocol/local";
import { MountManager } from "../../mounts/MountManager";
import { PersonaToolsConfig } from "../../mounts/types";
import { ScopedMcpClient, ScopedMcpConfig } from "../../mcp/ScopedMcpClient";
import { agentTarget } from "./AgentTarget";
import { badRequest, mcpServer, notFound } from "./AgentToolProtocol";
import { logSession } from "./AgentToolServerLog";
import { isAddressInUse } from "../../DaemonAddressError";
import { toolsPortInUseError } from "./AgentToolServerPort";
import { budgetsFor } from "./AgentToolServerBudgets";

export { toolsPort, DEFAULT_TOOLS_PORT } from "./AgentToolServerPort";

type Identity = { mountId: string; personaName: string };
type Session = { transport: HttpTransport };

export class AgentToolServer {
  private readonly sessions = new Map<string, Session>();
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
  start(port: number = 0) {
    try {
      this.bun = Bun.serve({ port, fetch: (req) => this.handle(req) });
    } catch (error) {
      throw isAddressInUse(error) ? toolsPortInUseError(port) : error;
    }
  }

  close() {
    this.sessions.forEach((session) => void session.transport.close());
    this.sessions.clear();
    this.bun?.stop();
  }

  urlFor(mountId: string, personaName: string): string {
    return `http://127.0.0.1:${this.bun!.port}/mcp/${mountId}/${personaName}`;
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
    const existing = sessionId ? this.sessions.get(sessionId) : undefined;
    if (existing) {
      return existing.transport.handleRequest(req);
    }
    return req.method === "POST"
      ? this.startSession(req, identity)
      : badRequest();
  }

  private async startSession(req: Request, identity: Identity) {
    const body = await req.json().catch(() => undefined);
    if (!isInitializeRequest(body)) {
      return badRequest();
    }
    const config = this.scopedConfig(identity);
    logSession(identity, Boolean(config));
    return config ? this.initSession(config, body, req) : notFound();
  }

  private async initSession(
    config: ScopedMcpConfig,
    body: unknown,
    req: Request,
  ) {
    const scoped = new ScopedMcpClient(this.client, config);
    const transport = this.transportFor();
    await mcpServer(scoped).connect(transport);
    return transport.handleRequest(req, { parsedBody: body });
  }

  private transportFor(): HttpTransport {
    const transport = new HttpTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => this.sessions.set(id, { transport }),
    });
    transport.onclose = () => this.forget(transport);
    return transport;
  }

  private forget(transport: HttpTransport) {
    if (transport.sessionId) {
      this.sessions.delete(transport.sessionId);
    }
  }

  private scopedConfig(identity: Identity): ScopedMcpConfig | undefined {
    const persona = this.personaTools(identity);
    return persona && budgetsFor(persona);
  }

  private personaTools(identity: Identity): PersonaToolsConfig | undefined {
    try {
      const { mountId, personaName } = identity;
      return agentTarget(this.mounts, mountId, personaName).persona.tools;
    } catch {
      return undefined;
    }
  }
}

function identityFrom(pathname: string): Identity | undefined {
  const match = /^\/mcp\/([^/]+)\/([^/]+)$/.exec(pathname);
  return match ? { mountId: match[1], personaName: match[2] } : undefined;
}
