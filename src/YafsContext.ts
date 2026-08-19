import type Yafs from "./index";
import { AbsolutePath } from "./core/AbsolutePath";
import { commandContext } from "./YafsCommandContext";
import { requiredArg } from "./YafsValues";
import { runScript } from "./YafsRunProgram";

export function yafsContext(yafs: Yafs) {
  return commandContext({ ...session(yafs), ...services(yafs) });
}

function services(yafs: Yafs) {
  return { ...coreServices(yafs), runProgram: runProgramFor(yafs) };
}

function coreServices(yafs: Yafs) {
  return {
    workspace: yafs.workspace,
    mounts: yafs.mounts,
    operations: yafs.operationQueue,
    traces: yafs.traces,
    cache: yafs.cache,
    desired: yafs.desired,
  };
}

function runProgramFor(yafs: Yafs) {
  return (path: AbsolutePath, args: string[]) =>
    runScript(yafs, { path, args });
}

function session(yafs: Yafs) {
  return {
    clock: yafs.clock,
    user: () => yafs.user.name,
    pwd: () => yafs.shell.pwd,
    resolve: (path: string) => yafs.shell.resolve(path),
    required: requiredArg,
    help: () => helpText(yafs),
  };
}

function helpText(yafs: Yafs) {
  return [...yafs.builtins.values()]
    .map((command) => command.synopsis)
    .sort()
    .join("\n");
}
