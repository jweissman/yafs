import { log } from "../../Logging";
import { PersonaConfig } from "../../mounts/types";
import { LmStudioMcpClient } from "./LmStudioMcpClient";

interface Mount {
  endpoint?: string;
  model?: string;
}
type Env = NodeJS.ProcessEnv;

export function lmStudioMcpClientFor(
  persona: PersonaConfig,
  mount: Mount,
  environment = process.env,
): LmStudioMcpClient {
  return clientFor(settingsFor(persona, mount, environment), environment);
}

function clientFor(settings: ReturnType<typeof settingsFor>, environment: Env) {
  return new LmStudioMcpClient(settings, fetch, timeoutMsFor(environment));
}

function timeoutMsFor(environment: Env): number | undefined {
  const value = environment.YAFS_LMSTUDIO_TIMEOUT_MS;
  return value ? Number(value) : undefined;
}

function settingsFor(persona: PersonaConfig, mount: Mount, env: Env) {
  return {
    apiUrl: persona.endpoint ?? mount.endpoint ?? defaultApiUrl(env),
    model: requiredModel(defaultModel(persona, mount, env)),
    accessToken: env.YAFS_LMSTUDIO_ACCESS_TOKEN,
  };
}

const NO_MODEL_MESSAGE =
  "No model resolved for this tool-enabled persona's LM Studio request. " +
  "Set the persona's model:, the mount's model:, or YAFS_LMSTUDIO_MODEL.";

function requiredModel(model: string | undefined): string {
  if (!model) {
    log.error({ reason: NO_MODEL_MESSAGE }, "agent tool completion rejected");
    throw new Error(NO_MODEL_MESSAGE);
  }
  return model;
}

function defaultApiUrl(environment: NodeJS.ProcessEnv): string {
  return environment.YAFS_LMSTUDIO_BASE_URL ?? "http://localhost:1234/api/v1";
}

function defaultModel(
  persona: PersonaConfig,
  mount: { model?: string },
  environment: NodeJS.ProcessEnv,
): string | undefined {
  return persona.model ?? mount.model ?? environment.YAFS_LMSTUDIO_MODEL;
}
