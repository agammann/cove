import { existsSync } from "node:fs";
import { buildServer } from "./server.js";
import { readConfig } from "./config.js";
if (existsSync(".env")) process.loadEnvFile(".env");
const c = readConfig();
const { app } = await buildServer(c);
await app.listen({
  port: c.PORT,
  host: c.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
