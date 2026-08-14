// The tool set granted to a scoped agent MCP server: read/inspection only.
// Deliberately excludes yafs.query (arbitrary command string, not
// structurally path-scopable) and yafs.capture/yafs.restore (durable
// mutations) — see docs/FEATURE-ROADMAP.md's M6.5 entry for the rationale.
export const BOUNDED_TOOL_NAMES = [
  "yafs.list",
  "yafs.read",
  "yafs.inspect",
  "yafs.tree",
  "yafs.find",
  "yafs.grep",
  "yafs.diff",
  "yafs.test",
];

export function boundedToolSet(): Set<string> {
  return new Set(BOUNDED_TOOL_NAMES);
}
