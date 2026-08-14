import { type Server } from "node:net";
import { VfsOperation } from "../vfs/VfsOperation";
import { BackgroundCommit } from "./BackgroundCommit";
import { Services } from "./ServerTypes";

export function serverAddress(server: Server): {
  host: string;
  port: number;
} {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Not listening");
  }
  return { host: address.address, port: address.port };
}

export function commitBackground(
  services: Pick<Services, "store" | "journal">,
  enqueueWork: (work: () => Promise<void>) => Promise<void>,
  operations: VfsOperation[],
): Promise<void> {
  const { store, journal } = services;
  return new BackgroundCommit(store, journal, enqueueWork).commit(operations);
}
