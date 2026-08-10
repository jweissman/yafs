import type Yafs from "./index";

export function variable(yafs: Yafs, name: string): string {
  if (name === "USER") {
    return yafs.user.name;
  }
  if (name === "PWD") {
    return yafs.shell.pwd;
  }
  return "";
}

export function requiredArg(
  command: string,
  args: string[],
  index: number,
): string {
  const value = args[index];
  return value || missingArg(command, index);
}

function missingArg(command: string, index: number): never {
  throw new Error(`${command} requires argument ${index + 1}`);
}
