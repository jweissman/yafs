import { McpServer } from "./mcp/Server";
import { runStdioMcpServer } from "./mcp/StdioLoop";
import { YashClient } from "./protocol/client";

const client = await YashClient.connect({
  host: process.env.YAFS_HOST || "127.0.0.1",
  port: Number(process.env.YAFS_PORT || 7337),
});
const server = new McpServer(client);

try {
  await runStdioMcpServer(server);
} finally {
  await client.close();
}
