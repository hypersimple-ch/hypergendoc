import { createConnection } from "node:net";

export function checkUnixSocket(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("renderer socket check timed out"));
    }, 1_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}
