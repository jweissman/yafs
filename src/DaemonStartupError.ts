export function startupError(content: string, logOffset = 0) {
  const current = content.slice(logOffset);
  const line = [...current.trim().split("\n")]
    .reverse()
    .find((entry) => entry.startsWith("error:"));
  return line && `yafsd failed to start: ${line.slice("error:".length).trim()}`;
}
