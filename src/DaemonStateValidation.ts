import { DaemonState } from "./daemon";

export function validate(value: unknown): DaemonState {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid daemon state");
  }
  const state = value as DaemonState;
  return validState(state) ? state : invalidState();
}

function invalidState(): never {
  throw new Error("Invalid daemon state");
}

function validState(state: DaemonState) {
  return validAddress(state) && validIdentity(state);
}

function validAddress(state: DaemonState) {
  return typeof state.host === "string" && Number.isInteger(state.port);
}

function validIdentity(state: DaemonState) {
  return (
    Number.isInteger(state.pid) &&
    typeof state.startedAt === "string" &&
    typeof state.instanceId === "string" &&
    (state.configPath === undefined || typeof state.configPath === "string")
  );
}
