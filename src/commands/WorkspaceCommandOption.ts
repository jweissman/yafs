type Option = [string | undefined, string[]];

export function option(args: string[], name: string): Option {
  const index = args.indexOf(name);
  if (index < 0) {
    return [undefined, args];
  }
  if (!args[index + 1]) {
    throw new Error("missing command argument");
  }
  return selected(args, index);
}

function selected(args: string[], index: number): Option {
  const rest = [...args.slice(0, index), ...args.slice(index + 2)];
  return [args[index + 1]!, rest];
}
