// The real `yafsd` binary's chosen port (not AgentToolServer's own default,
// which stays an OS-assigned ephemeral port — see AgentToolServer.start()).
// Fixed rather than ephemeral: LM Studio's mcp.json registration needs a
// stable URL across daemon restarts — an ephemeral port would go stale
// every time and require rewriting mcp.json (and possibly reloading LM
// Studio) on every `yafsd start`.
export const DEFAULT_TOOLS_PORT = 7338;

export function toolsPort(environment = process.env): number {
  const value = Number(environment.YAFS_AGENT_TOOLS_PORT);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_TOOLS_PORT;
}

export function toolsPortInUseError(port: number): Error {
  return new Error(
    `Agent tool server port ${port} is already in use — another yafsd, ` +
      "or something else, is already bound to it. Set YAFS_AGENT_TOOLS_PORT " +
      "to a free port.",
  );
}
