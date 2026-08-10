import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Yafs from "../src";
import { parseManifest } from "../src/mounts/Manifest";
import { ManifestMount, PreparedMountRecord } from "../src/mounts/types";
import { YafsServer, type StartOptions } from "../src/protocol/server";
import { YashClient } from "../src/protocol/client";

const ROOT = "/home/root";

export async function activateDesired(
  yafs: Yafs,
  manifestSource: string,
  id?: string,
): Promise<PreparedMountRecord> {
  const prepared = await preparedRecord(yafs, manifestSource, id);
  yafs.mounts.activate(prepared, "test");
  return prepared;
}

export async function refreshDesired(
  yafs: Yafs,
  manifestSource: string,
  id?: string,
): Promise<PreparedMountRecord> {
  const prepared = await preparedRecord(yafs, manifestSource, id);
  yafs.mounts.refresh(prepared, "test");
  return prepared;
}

async function preparedRecord(yafs: Yafs, manifestSource: string, id?: string) {
  const { manifest, digest } = parseManifest(manifestSource);
  const mount = declaredMount(manifest.mounts, id);
  const record = yafs.mounts.planDesired(mount, digest, ROOT);
  return yafs.mounts.prepareActivation(record, "test");
}

function declaredMount(mounts: ManifestMount[], id?: string) {
  const mount = id ? mounts.find((item) => item.id === id) : mounts[0];
  if (!mount) {
    throw new Error(`No declared mount: ${id ?? "(first)"}`);
  }
  return mount;
}

export async function startedHostConfigServer(
  prefix: string,
  configSource: string,
  options: StartOptions = {},
) {
  const config = await writtenHostConfig(prefix, configSource);
  const server = await startedServer(config, options);
  const client = await YashClient.connect(server.address());
  return { ...config, server, client };
}

async function writtenHostConfig(prefix: string, configSource: string) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const configPath = join(directory, "yafs.plugins.yaml");
  await writeFile(configPath, configSource);
  return { directory, configPath };
}

function startedServer(
  config: { directory: string; configPath: string },
  options: StartOptions,
) {
  return YafsServer.start({
    ...options,
    dataDir: config.directory,
    configPath: config.configPath,
  });
}
