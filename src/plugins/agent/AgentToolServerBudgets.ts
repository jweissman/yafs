import { PersonaToolsConfig } from "../../mounts/types";
import { ScopedMcpConfig } from "../../mcp/ScopedMcpClient";

const DEFAULT_BUDGETS = {
  maxResultBytes: 20_000,
  maxCalls: 20,
  deadlineMs: 60_000,
};

export function budgetsFor(tools: PersonaToolsConfig): ScopedMcpConfig {
  return {
    roots: tools.roots,
    maxResultBytes: tools.maxResultBytes ?? DEFAULT_BUDGETS.maxResultBytes,
    maxCalls: tools.maxCalls ?? DEFAULT_BUDGETS.maxCalls,
    deadlineMs: tools.deadlineMs ?? DEFAULT_BUDGETS.deadlineMs,
  };
}
