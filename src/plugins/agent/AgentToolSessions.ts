import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport as HttpTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface McpTransport extends Transport {
  handleRequest(
    request: Request,
    options?: { parsedBody: unknown },
  ): Promise<Response>;
}

interface Session {
  transport: McpTransport;
}

export class AgentToolSessions {
  private readonly sessions = new Map<string, Session>();

  // Bun instruments an implicit field-initializing constructor as uncovered.
  constructor() {}

  find(id: string | undefined): McpTransport | undefined {
    return id ? this.sessions.get(id)?.transport : undefined;
  }

  create(): McpTransport {
    const transport = newTransport(this.sessions);
    transport.onclose = () => {
      this.forget(transport);
    };
    return transport;
  }

  close() {
    for (const session of this.sessions.values()) {
      void session.transport.close();
    }
    this.sessions.clear();
  }

  private forget(transport: McpTransport) {
    if (transport.sessionId) {
      this.sessions.delete(transport.sessionId);
    }
  }
}

function newTransport(sessions: Map<string, Session>): McpTransport {
  const current: McpTransport = new HttpTransport({
    sessionIdGenerator: randomUUID,
    onsessioninitialized: sessionInitializer(sessions, () => current),
    enableJsonResponse: true,
  });
  return current;
}

function sessionInitializer(
  sessions: Map<string, Session>,
  current: () => McpTransport,
) {
  return (id: string) => {
    sessions.set(id, { transport: current() });
  };
}
