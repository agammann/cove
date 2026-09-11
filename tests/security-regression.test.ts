import { it, expect } from "vitest";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { Pool } from "pg";
import { CoveService } from "../packages/domain/service.js";
import { makeMailTransport } from "../apps/api/auth.js";
import { readConfig } from "../apps/api/config.js";

it("drops extra runtime configuration fields before retaining domain limits", async () => {
  const pool = new Pool();
  const input = {
    MAX_PROJECTS: 50,
    MAX_REVISIONS: 1000,
    MAX_STORAGE_BYTES: 104857600,
    BETTER_AUTH_SECRET: "synthetic-secret-sentinel",
    DATABASE_URL: "synthetic-database-sentinel",
    SMTP_PASSWORD: "synthetic-mail-sentinel",
  };
  const service = new CoveService(pool, input);
  expect(Object.keys(service.limits).sort()).toEqual([
    "MAX_PROJECTS",
    "MAX_REVISIONS",
    "MAX_STORAGE_BYTES",
  ]);
  expect(service.limits).not.toBe(input);
  expect(Object.isFrozen(service.limits)).toBe(true);
  await pool.end();
});

it("production SMTP rejects a server without TLS before AUTH or message data", async () => {
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.write("220 local-test ESMTP\r\n");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const command = line.split(" ")[0];
        commands.push(command);
        if (command === "EHLO")
          socket.write("250-local-test\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (command === "STARTTLS")
          socket.write("454 TLS unavailable in fixture\r\n");
        else socket.write("550 unexpected command\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const c = readConfig({
    NODE_ENV: "production",
    APP_URL: "https://cove.example",
    DATABASE_URL: "postgresql://fixture",
    BETTER_AUTH_SECRET: "synthetic-auth-value-for-local-test-only",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String((server.address() as AddressInfo).port),
    SMTP_SECURE: "false",
    SMTP_FROM: "fixture@example.test",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "fixture-only",
  });
  const transport = makeMailTransport(c);
  try {
    await expect(
      transport.sendMail({
        to: "fixture@example.test",
        from: c.SMTP_FROM,
        subject: "Fixture",
        text: "synthetic recovery message",
      }),
    ).rejects.toBeDefined();
    expect(commands).toContain("STARTTLS");
    expect(
      commands.some((c) => ["AUTH", "MAIL", "RCPT", "DATA"].includes(c)),
    ).toBe(false);
  } finally {
    transport.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
