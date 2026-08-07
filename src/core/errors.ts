const ERROR_CODES: [string, string][] = [
  ["Failed to parse input:", "parse_error"],
  ["Unknown command:", "unknown_command"],
  ["No such file:", "not_found"],
  ["No such directory:", "not_found"],
  ["No such parent directory:", "not_found"],
  ["Not a directory:", "not_directory"],
  ["Is a directory:", "is_directory"],
  ["Path already exists:", "already_exists"],
  ["Directory not empty:", "not_empty"],
  ["Too many symbolic links", "link_loop"],
  ["Read-only union mount:", "read_only_mount"],
  ["Read-only mount:", "read_only_mount"],
];

export function errorCode(message: string): string {
  return (
    ERROR_CODES.find(([prefix]) => message.startsWith(prefix))?.[1] ||
    "command_error"
  );
}
