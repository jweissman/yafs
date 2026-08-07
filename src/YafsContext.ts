import type Yafs from "./index";
import { commandContext } from "./YafsCommandContext";

export function yafsContext(yafs: Yafs) {
  return commandContext({ ...session(yafs), ...services(yafs) });
}

function services(yafs: Yafs) {
  return {
    workspace: yafs.workspace,
    mounts: yafs.mounts,
    operations: yafs.operationQueue,
    traces: yafs.traces,
    cache: yafs.cache,
    desired: yafs.desired,
  };
}

function session(yafs: Yafs) {
  return {
    clock: yafs.clock,
    user: () => yafs.user.name,
    pwd: () => yafs.shell.pwd,
    resolve: (path: string) => yafs.shell.resolve(path),
    required: yafs.requiredArg.bind(yafs),
    help: () => helpText(yafs),
  };
}

function helpText(yafs: Yafs) {
  return [...yafs.builtins.values()]
    .map((command) => command.synopsis)
    .sort()
    .join("\n");
}
