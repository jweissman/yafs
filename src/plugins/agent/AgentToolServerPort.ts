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
