export function logStartup(
  address: { host: string; port: number },
  dataDir: string,
  toolsPort?: number,
) {
  console.log(
    `yafsd listening on ${address.host}:${address.port}; data: ${dataDir}`,
  );
  logAgentTools(toolsPort);
}

function logAgentTools(toolsPort?: number) {
  if (toolsPort !== undefined) {
    console.log(`agent tool server listening on 127.0.0.1:${toolsPort}`);
  }
}
