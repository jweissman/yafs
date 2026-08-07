export function completionTarget(input: string) {
  const token = input.trimEnd().split(/\s+/).at(-1) || "";
  const slash = token.lastIndexOf("/");
  const directory = slash === -1 ? "." : token.slice(0, slash) || "/";
  const prefix = slash === -1 ? token : token.slice(slash + 1);
  return {
    directory,
    prefix,
    format: (name: string) =>
      slash === -1 ? name : `${token.slice(0, slash + 1)}${name}`,
  };
}
