import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import Yafs from "../../../src";
import { AgentToolServer } from "../../../src/plugins/agent/AgentToolServer";

export function toolServer(yafs: Yafs): AgentToolServer {
  const { store, mounts, traces, cache, desired } = yafs;
  return new AgentToolServer(mounts, { store, mounts, traces, cache, desired });
}

export async function connectedClient(
  server: AgentToolServer,
  mountId: string,
  personaName: string,
) {
  const url = server.urlFor(mountId, personaName);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
}

export function textOf(result: unknown): string | undefined {
  const content = (result as { content?: { text?: string }[] }).content;
  return content?.[0]?.text;
}

export function manifest(roots: string[], maxCalls = 5) {
  const rootsYaml = roots.map((root) => `"${root}"`).join(", ");
  return (
    "{version: 1, mounts: [{id: agents, path: agents, provider: agent, " +
    'config: {personas: {reviewer: {prompt: "You are a reviewer.", ' +
    `tools: {roots: [${rootsYaml}], maxCalls: ${maxCalls}}}}}, ` +
    "capabilities: [chat.completion]}]}"
  );
}
