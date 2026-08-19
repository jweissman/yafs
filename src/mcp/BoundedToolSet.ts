export const BOUNDED_TOOL_NAMES = [
  "yafs.list",
  "yafs.read",
  "yafs.inspect",
  "yafs.tree",
  "yafs.find",
  "yafs.grep",
  "yafs.diff",
  "yafs.test",
  "yafs.start_here",
];

export function boundedToolSet(): Set<string> {
  return new Set(BOUNDED_TOOL_NAMES);
}
