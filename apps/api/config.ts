import { z } from "zod";
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(4317),
      APP_URL: z.url(),
      DATABASE_URL: z.string().min(1),
      BETTER_AUTH_SECRET: z.string().min(32),
      SMTP_HOST: z.string().min(1),
      SMTP_PORT: z.coerce.number().int().positive().default(587),
      SMTP_SECURE: z.enum(["true", "false"]).default("false"),
      SMTP_FROM: z.string().min(1),
      SMTP_USER: z.string().optional(),
      SMTP_PASSWORD: z.string().optional(),
      MAX_PROJECTS: z.coerce.number().int().min(1).max(1000).default(50),
      MAX_REVISIONS: z.coerce.number().int().min(2).max(5000).default(1000),
      MAX_STORAGE_BYTES: z.coerce.number().int().min(10000).default(104857600),
      RATE_LIMIT: z.coerce.number().int().min(10).default(120),
      TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    })
    .parse(env);
  const u = new URL(parsed.APP_URL);
  if (u.pathname !== "/" || u.search || u.hash || u.username || u.password)
    throw new Error("APP_URL must be a bare origin");
  if (
    parsed.NODE_ENV === "production" &&
    (u.protocol !== "https:" ||
      env.DEMO_AUTH ||
      env.AUTH_MODE === "demo" ||
      parsed.BETTER_AUTH_SECRET.startsWith("replace-") ||
      !parsed.SMTP_USER ||
      !parsed.SMTP_PASSWORD)
  )
    throw new Error(
      "Production requires HTTPS, random secret, authenticated SMTP, and no demo authentication",
    );
  if (
    parsed.NODE_ENV !== "production" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  )
    throw new Error("Development must use a loopback origin");
  return { ...parsed, APP_URL: u.origin };
}
export type Config = ReturnType<typeof readConfig>;
