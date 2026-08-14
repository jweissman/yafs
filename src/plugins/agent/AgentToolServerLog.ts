type Identity = { mountId: string; personaName: string };

export function logSession(identity: Identity, found: boolean) {
  if (found) {
    logSessionStart(identity);
  } else {
    logRejected(identity);
  }
}

function logSessionStart(identity: Identity) {
  console.log(
    `agent tool session started for ${identity.mountId}/${identity.personaName}`,
  );
}

function logRejected(identity: Identity) {
  console.error(
    `agent tool session rejected for ${identity.mountId}/${identity.personaName}: ` +
      "no such tool-enabled persona (check the persona exists and has `tools:` configured)",
  );
}
