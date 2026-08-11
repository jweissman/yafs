export function lines(value: string) {
  return value === "" ? [] : value.split("\n");
}

export function count(args: string[], command: string) {
  if (args[0] !== "-n" || !/^\d+$/.test(args[1] || "")) {
    throw new Error(`${command} requires -n COUNT PATH`);
  }
  return Number(args[1]);
}

export function path(args: string[], command: string) {
  const value = args.at(-1);
  if (!value) {
    throw new Error(`${command} requires a path`);
  }
  return value;
}
