import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import nodemailer from "nodemailer";
import type { Pool } from "pg";
import type { Config } from "./config.js";
export function makeMailTransport(c: Config) {
  return nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_SECURE === "true",
    requireTLS: c.NODE_ENV === "production" && c.SMTP_SECURE !== "true",
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...(c.SMTP_USER
      ? { auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD } }
      : {}),
  });
}
export function makeAuth(pool: Pool, c: Config) {
  const mail = makeMailTransport(c);
  const send = async (to: string, subject: string, url: string) => {
    await mail.sendMail({
      from: c.SMTP_FROM,
      to,
      subject,
      text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.`,
    });
  };
  return betterAuth({
    appName: "Cove",
    baseURL: c.APP_URL,
    basePath: "/api/auth",
    secret: c.BETTER_AUTH_SECRET,
    database: pool,
    trustedOrigins: [c.APP_URL],
    disabledPaths: ["/token", "/delete-user"],
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-cove-client-ip"] },
      useSecureCookies: c.NODE_ENV === "production",
      disableCSRFCheck: false,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: c.NODE_ENV === "production",
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        send(user.email, "Reset your Cove password", url),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send(user.email, "Verify your Cove email", url),
    },
    rateLimit: { enabled: true, window: 60, max: 60 },
    plugins: [
      jwt(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: `${c.APP_URL}/mcp`,
        scopes: ["openid", "profile", "offline_access", "cove"],
        grantTypes: ["authorization_code", "refresh_token"],
        accessTokenExpiresIn: 900,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        refreshTokenReuseInterval: 0,
        clientPrivileges: async () => false,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    ],
  });
}
export type Auth = ReturnType<typeof makeAuth>;
