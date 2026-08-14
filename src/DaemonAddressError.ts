export function isAddressInUse(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as NodeJS.ErrnoException).code === "EADDRINUSE",
  );
}

export function addressInUseError(host: string, port: number): Error {
  return new Error(
    `Port ${host}:${port} is already in use; another yafsd (perhaps a ` +
      "different data directory, or one started outside this lifecycle) " +
      "may already be listening",
  );
}
