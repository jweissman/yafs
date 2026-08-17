import { Server } from "node:net";

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(closeResult(resolve, reject));
  });
}

function closeResult(resolve: () => void, reject: (error: Error) => void) {
  return (error?: Error) => {
    if (error) {
      reject(error);
      return;
    }
    resolve();
  };
}
