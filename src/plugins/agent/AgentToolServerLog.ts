import { log } from "../../Logging";

const toolServerLog = log.getSubLogger({ name: "agent.toolServer" });

interface Identity {
  mountId: string;
  personaName: string;
}

export function logSession(identity: Identity, found: boolean) {
  if (found) {
    logSessionStart(identity);
  } else {
    logRejected(identity);
  }
}

function logSessionStart(identity: Identity) {
  toolServerLog.info(identity, "agent tool session started");
}

function logRejected(identity: Identity) {
  toolServerLog.error(
    identity,
    "agent tool session rejected: no such tool-enabled persona " +
      "(check the persona exists and has `tools:` configured)",
  );
}
