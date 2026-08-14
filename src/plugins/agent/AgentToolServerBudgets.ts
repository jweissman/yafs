import { PersonaToolsConfig } from "../../mounts/types";
import { ScopedMcpConfig } from "../../mcp/ScopedMcpClient";

// deadlineMs bounds the whole MCP session, not one call — and the clock
// starts at session creation, which can precede the model's own
// reasoning/generation time before it ever emits a tool call. A local
// model's inference latency alone can exceed a tight deadline before a
// single real tool call happens; 5 minutes leaves room for that without
// being unbounded. Override per persona via tools.deadlineMs if needed.
const DEFAULT_BUDGETS = {
  maxResultBytes: 20_000,
  maxCalls: 20,
  deadlineMs: 300_000,
};

export function budgetsFor(tools: PersonaToolsConfig): ScopedMcpConfig {
  return {
    roots: tools.roots,
    maxResultBytes: tools.maxResultBytes ?? DEFAULT_BUDGETS.maxResultBytes,
    maxCalls: tools.maxCalls ?? DEFAULT_BUDGETS.maxCalls,
    deadlineMs: tools.deadlineMs ?? DEFAULT_BUDGETS.deadlineMs,
  };
}
