import { app } from "./app.js";
import { env } from "./config/env.js";
import { closePool } from "./db/pool.js";

const server = app.listen(env.PORT, "0.0.0.0", () =>
  console.log(`API listening on port ${env.PORT}`),
);

async function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
