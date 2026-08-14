import { expect, test } from "bun:test";

import {
  DEFAULT_TOOLS_PORT,
  toolsPort,
  toolsPortInUseError,
} from "../../../src/plugins/agent/AgentToolServerPort";

test("toolsPort falls back to DEFAULT_TOOLS_PORT when unset or invalid", () => {
  expect(toolsPort({})).toBe(DEFAULT_TOOLS_PORT);
  expect(toolsPort({ YAFS_AGENT_TOOLS_PORT: "not-a-number" })).toBe(
    DEFAULT_TOOLS_PORT,
  );
  expect(toolsPort({ YAFS_AGENT_TOOLS_PORT: "-1" })).toBe(DEFAULT_TOOLS_PORT);
});

test("toolsPort honors a valid YAFS_AGENT_TOOLS_PORT", () => {
  expect(toolsPort({ YAFS_AGENT_TOOLS_PORT: "9000" })).toBe(9000);
});

test("toolsPortInUseError names the port and points at the env var", () => {
  const message = toolsPortInUseError(7338).message;
  expect(message).toContain("7338");
  expect(message).toContain("YAFS_AGENT_TOOLS_PORT");
});
