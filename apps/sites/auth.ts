import { betterAuth } from "better-auth";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { createHash } from "node:crypto";
import type { Environment } from "./types.js";
export function sitesAuth(env: Environment) {
  const origin = env.APP_URL;
  if (!origin || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw Error("Missing runtime configuration");
  return betterAuth({
    appName: "Cove",
    baseURL: origin,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB as any,
    trustedOrigins: [origin],
    disabledPaths: ["/token", "/delete-user", "/update-user", "/change-email"],
    advanced: {
      useSecureCookies: new URL(origin).protocol === "https:",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(origin).protocol === "https:",
      },
    },
    session: {
      expiresIn: 604800,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: true, window: 60, max: 60, storage: "database" },
    plugins: [
      jwt(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: `${origin}/api/mcp`,
        scopes: ["openid", "profile", "offline_access", "cove"],
        grantTypes: ["authorization_code", "refresh_token"],
        accessTokenExpiresIn: 900,
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        refreshTokenReuseInterval: 0,
        clientPrivileges: async () => false,
      }),
      {
        id: "cove-sites-signin",
        endpoints: {
          sitesSignIn: createAuthEndpoint(
            "/chatgpt",
            { method: "GET" },
            async (ctx) => {
              // Only Sites dispatch injects these headers. Local test identities are supplied
              // by the isolated test harness, never a production bypass or browser parameter.
              const oid = ctx.request?.headers.get("oai-authenticated-user-id"),
                email = ctx.request?.headers.get(
                  "oai-authenticated-user-email",
                );
              if (!oid || !email)
                throw new APIError("UNAUTHORIZED", {
                  message: "Sign in with ChatGPT first.",
                });
              const userId =
                "siwc_" + createHash("sha256").update(oid).digest("hex");
              const returnTo =
                new URL(ctx.request!.url).searchParams.get("returnTo") ||
                "/projects";
              if (
                !returnTo.startsWith("/") ||
                returnTo.startsWith("//") ||
                returnTo.includes("\\") ||
                new URL(returnTo, origin).origin !== origin
              )
                throw new APIError("BAD_REQUEST", {
                  message: "Invalid return path.",
                });
              let user = await ctx.context.internalAdapter.findUserById(userId);
              if (!user) {
                try {
                  user = await ctx.context.internalAdapter.createUser(
                    {
                      id: userId,
                      email,
                      emailVerified: true,
                      name: email.split("@")[0]!.slice(0, 100),
                    },
                    { method: "chatgpt" },
                  );
                } catch (e) {
                  user = await ctx.context.internalAdapter.findUserById(userId);
                  if (!user) throw e;
                }
              }
              await env.DB.prepare(
                "INSERT INTO site_owners(id,name) VALUES(?,?) ON CONFLICT(id) DO NOTHING",
              )
                .bind(user.id, user.name)
                .run();
              const session = await ctx.context.internalAdapter.createSession(
                user.id,
              );
              if (!session)
                throw new APIError("INTERNAL_SERVER_ERROR", {
                  message: "Sign in failed.",
                });
              await setSessionCookie(ctx, { session, user });
              return ctx.redirect(returnTo);
            },
          ),
        },
      },
    ],
  });
}
