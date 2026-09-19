import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import type { Pool } from "pg";

import { serverEnv } from "@/config/server-env";
import { getPool } from "@/server/database/pool";
import { checkAndRecordOtpRequest } from "@/server/auth/otp-request-log";
import { createDefaultEmailSender } from "@/server/email/create-email-sender";
import { withDevInboxRecording } from "@/server/email/dev-inbox";
import type { EmailSender } from "@/server/email/types";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
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

export interface CreateAuthOptions {
  database?: Pool;
  emailSender?: EmailSender;
}

export function buildAuthOptions({
  database = getPool(),
  emailSender = createDefaultEmailSender(),
}: CreateAuthOptions = {}) {
  const effectiveEmailSender =
    process.env.NODE_ENV === "production"
      ? emailSender
      : withDevInboxRecording(emailSender);

  return {
    baseURL: serverEnv.NEXT_PUBLIC_APP_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    database,
    trustedOrigins: [serverEnv.NEXT_PUBLIC_APP_URL],
    emailAndPassword: {
      enabled: false,
    },
    session: {
      expiresIn: SESSION_DURATION_SECONDS,
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
          await effectiveEmailSender.sendOtpEmail({ to: email, otp, type });
        },
      }),
      // Must stay last: it lets `auth.api.*` server calls set cookies
      // through Next.js's `cookies()` API.
      nextCookies(),
    ],
  };
}

export function createAuth(options: CreateAuthOptions = {}) {
  return betterAuth(buildAuthOptions(options));
}

export const auth = createAuth();
export type Auth = ReturnType<typeof createAuth>;
