import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db, schema } from "@/db";
import { config, emailDomainAllowed } from "./config";
import { findPendingInviteByEmail } from "./invites";

const env = process.env;

export const auth = betterAuth({
  appName: `${config.companyName} ${config.appName}`,
  baseURL: config.appUrl,
  secret: env.BETTER_AUTH_SECRET,
  telemetry: { enabled: false },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
    },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 10, autoSignIn: true },
  socialProviders: {
    ...(config.providers.google && {
      google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! },
    }),
    ...(config.providers.microsoft && {
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID!,
        clientSecret: env.MICROSOFT_CLIENT_SECRET!,
        tenantId: env.MICROSOFT_TENANT_ID || "common",
      },
    }),
    ...(config.providers.slack && {
      slack: { clientId: env.SLACK_CLIENT_ID!, clientSecret: env.SLACK_CLIENT_SECRET! },
    }),
  },
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "microsoft", "slack"] } },
  user: {
    additionalFields: {
      // Never settable from sign-up input; changed only by accepting an invite.
      role: { type: "string", defaultValue: "staff", input: false },
      phone: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          // Staff accounts are limited to company email addresses. Anyone else needs an invite.
          if (emailDomainAllowed(u.email)) return;
          if (await findPendingInviteByEmail(u.email)) return;
          throw new APIError("FORBIDDEN", {
            message: "Use your work email address. If you've been invited, open the link from your invite.",
          });
        },
      },
    },
  },
  plugins: [twoFactor({ issuer: `${config.companyName} IT`, allowPasswordless: true }), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
