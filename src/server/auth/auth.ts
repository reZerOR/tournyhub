import { APIError, betterAuth, type BetterAuthOptions } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { GoogleOptions } from "better-auth/social-providers";
import type { Pool } from "pg";

import { serverEnv } from "@/config/server-env";
import { getPool } from "@/server/database/pool";
import { checkAndRecordOtpRequest } from "@/server/auth/otp-request-log";
import { createDefaultEmailSender } from "@/server/email/create-email-sender";
import type { EmailSender } from "@/server/email/types";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
export const RECENT_AUTH_SECONDS = 60 * 10;
const OTP_LENGTH = 6;
const OTP_EXPIRES_IN_SECONDS = 60 * 10;
const OTP_ALLOWED_ATTEMPTS = 5;
// Better Auth's built-in per-IP limiter is shared by every email-otp
// endpoint. It must comfortably exceed OTP_ALLOWED_ATTEMPTS, or a user
// still holding valid attempts could be IP-throttled first. The
// per-email cooldown below is the real defense for the send endpoint.
const OTP_IP_RATE_LIMIT_WINDOW_SECONDS = 60;
const OTP_IP_RATE_LIMIT_MAX = 10;

// The emailOTP plugin unconditionally registers password-reset endpoints
// that hash and persist a real password to the account table, regardless
// of `emailAndPassword.enabled`. TournyHub is passwordless-only (ADR-0003,
// ADR-0011), so these must be blocked at the router level.
const DISABLED_PASSWORD_PATHS = new Set([
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/forget-password/email-otp",
]);
const RECENT_AUTH_PATHS = new Set([
  "/link-social",
  "/revoke-other-sessions",
  "/revoke-session",
  "/revoke-sessions",
  "/unlink-account",
]);

export type GoogleAuthOptions = Pick<
  GoogleOptions,
  "clientId" | "clientSecret" | "getUserInfo"
>;

export interface CreateAuthOptions {
  database?: Pool;
  emailSender?: EmailSender;
  google?: GoogleAuthOptions;
}

export function buildAuthOptions({
  database = getPool(),
  emailSender = createDefaultEmailSender(),
  google = serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET
    ? {
        clientId: serverEnv.GOOGLE_CLIENT_ID,
        clientSecret: serverEnv.GOOGLE_CLIENT_SECRET,
      }
    : undefined,
}: CreateAuthOptions = {}) {
  return {
    baseURL: serverEnv.NEXT_PUBLIC_APP_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [serverEnv.NEXT_PUBLIC_APP_URL],
    emailAndPassword: {
      enabled: false,
    },
    ...(google
      ? {
          socialProviders: {
            google: {
              ...google,
              requireEmailVerification: true,
            },
          },
        }
      : {}),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        allowDifferentEmails: false,
        allowUnlinkingAll: true,
        enabled: true,
      },
    },
    user: {
      additionalFields: {
        appearance: {
          defaultValue: "light",
          required: true,
          type: ["light", "dark"],
        },
        soundEnabled: {
          defaultValue: false,
          required: true,
          type: "boolean" as const,
        },
      },
      validateUserInfo: ({ source, user }) => {
        if (
          source.oauth?.providerId === "google" &&
          user.emailVerified !== true
        ) {
          return {
            error: "email_not_verified",
            errorDescription: "Google did not verify this email address.",
          };
        }
      },
    },
    session: {
      expiresIn: SESSION_DURATION_SECONDS,
      freshAge: RECENT_AUTH_SECONDS,
    },
    rateLimit: {
      enabled: true,
      storage: "database" as const,
    },
    advanced: {
      cookiePrefix: "tournyhub",
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (DISABLED_PASSWORD_PATHS.has(ctx.path ?? "")) {
          throw new APIError("NOT_FOUND");
        }

        if (RECENT_AUTH_PATHS.has(ctx.path ?? "")) {
          const session = await getSessionFromCtx(ctx);
          if (!session?.session) {
            throw new APIError("UNAUTHORIZED", {
              code: "UNAUTHORIZED",
              message: "Sign in to continue.",
            });
          }

          const sessionAge =
            Date.now() - new Date(session.session.createdAt).getTime();
          if (sessionAge >= RECENT_AUTH_SECONDS * 1000) {
            throw new APIError("FORBIDDEN", {
              code: "SESSION_NOT_FRESH",
              message: "Sign in again before changing account access.",
            });
          }
        }

        if (ctx.path === "/update-user" && ctx.body?.name !== undefined) {
          if (typeof ctx.body.name !== "string") {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_DISPLAY_NAME",
              message: "Display name must be text.",
            });
          }

          const displayName = ctx.body.name.trim();
          if (displayName.length === 0 || displayName.length > 100) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_DISPLAY_NAME",
              message: "Display name must be between 1 and 100 characters.",
            });
          }
          ctx.body.name = displayName;
        }

        if (ctx.path !== "/email-otp/send-verification-otp") {
          return;
        }

        const email = ctx.body?.email;
        if (typeof email !== "string" || email.length === 0) {
          return;
        }

        const decision = await checkAndRecordOtpRequest(database, email);
        if (!decision.allowed) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: "Wait before requesting another code for this email.",
          });
        }
      }),
    },
    plugins: [
      emailOTP({
        allowedAttempts: OTP_ALLOWED_ATTEMPTS,
        disableSignUp: false,
        expiresIn: OTP_EXPIRES_IN_SECONDS,
        otpLength: OTP_LENGTH,
        rateLimit: {
          max: OTP_IP_RATE_LIMIT_MAX,
          window: OTP_IP_RATE_LIMIT_WINDOW_SECONDS,
        },
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          await emailSender.sendOtpEmail({ to: email, otp, type });
        },
      }),
      // Must stay last: it lets `auth.api.*` server calls set cookies
      // through Next.js's `cookies()` API.
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(options: CreateAuthOptions = {}) {
  return betterAuth(buildAuthOptions(options));
}

export const auth = createAuth();
export type Auth = ReturnType<typeof createAuth>;
