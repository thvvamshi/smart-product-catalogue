import { app } from "./app.js";
import { env } from "./config/env.js";
import { closePool } from "./db/pool.js";
import { expire } from "./services/checkout.service.js";
import { createServer } from "node:http";
import { attachSocket } from "./socket.js";

const server = createServer(app);
attachSocket(server);
server.listen(env.PORT, "0.0.0.0", () =>
  console.log(`API listening on port ${env.PORT}`),
);
let expiryTimer: NodeJS.Timeout | undefined;
let expiryWorkerDisabled = false;
const runExpiry = async () => {
  if (expiryWorkerDisabled) return;
  try {
    await expire();
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01") {
      // The worker must not hammer an uninitialised database. Migrations remain
      // an explicit operator action; disable this process until the next restart.
      expiryWorkerDisabled = true;
      if (expiryTimer) clearInterval(expiryTimer);
      console.error("Reservation expiry worker disabled: inventory reservation tables are not ready. Run the local migrations before restarting.");
      return;
    }
    console.error("Reservation expiry task failed:", error instanceof Error ? error.message : "Unknown error");
  }
};
expiryTimer = setInterval(() => void runExpiry(), env.RESERVATION_EXPIRY_INTERVAL_MS);
expiryTimer.unref();

async function shutdown(signal: string) {
  if (expiryTimer) clearInterval(expiryTimer);
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
