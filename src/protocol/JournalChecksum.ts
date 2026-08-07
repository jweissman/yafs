import { createHash } from "node:crypto";

export const VERSION = 1;

export function checksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function notFound(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
