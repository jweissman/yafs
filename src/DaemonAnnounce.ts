import { log } from "./Logging";

const daemonLog = log.getSubLogger({ name: "daemon" });

export function logStartup(
  address: { host: string; port: number },
  dataDir: string,
  toolsPort?: number,
) {
  daemonLog.info({ host: address.host, port: address.port, dataDir }, "yafsd listening");
  logAgentTools(toolsPort);
}

function logAgentTools(toolsPort?: number) {
  if (toolsPort !== undefined) {
    daemonLog.info({ toolsPort }, "agent tool server listening");
  }
}
