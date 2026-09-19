import type { Pool } from "pg";

export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_REQUEST_WINDOW_SECONDS = 60 * 60;
export const OTP_MAX_REQUESTS_PER_WINDOW = 5;

export interface OtpRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function normalizeOtpEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function secondsUntilCooldownExpires(
  lastRequestedAt: Date,
  now: Date,
  cooldownSeconds: number,
): number {
  const elapsedSeconds = (now.getTime() - lastRequestedAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsedSeconds));
}

/**
 * Decides whether another OTP may be sent given prior request timestamps
 * for the same normalized email, most recent first.
 */
export function evaluateOtpRequestRate(
  recentRequestsDescending: Date[],
  now: Date,
  options: {
    cooldownSeconds: number;
    maxRequests: number;
    windowSeconds: number;
  },
): OtpRateLimitDecision {
  const [mostRecent] = recentRequestsDescending;
  if (mostRecent) {
    const cooldownRemaining = secondsUntilCooldownExpires(
      mostRecent,
      now,
      options.cooldownSeconds,
    );
    if (cooldownRemaining > 0) {
      return { allowed: false, retryAfterSeconds: cooldownRemaining };
    }
  }

  if (recentRequestsDescending.length >= options.maxRequests) {
    return { allowed: false, retryAfterSeconds: options.windowSeconds };
  }

  return { allowed: true };
}

/**
 * Enforces the 60-second-per-email resend cooldown plus a broader hourly
 * cap, and records the attempt when it is allowed. Better Auth's own
 * rate limiter is IP-scoped, so this is the email-scoped layer described
 * in the security policy.
 */
export async function checkAndRecordOtpRequest(
  pool: Pool,
  email: string,
  now: Date = new Date(),
): Promise<OtpRateLimitDecision> {
  const normalizedEmail = normalizeOtpEmail(email);
  const windowStart = new Date(
    now.getTime() - OTP_REQUEST_WINDOW_SECONDS * 1000,
  );

  const { rows } = await pool.query<{ requested_at: Date }>(
    `select requested_at
       from identity_otp_request
      where email_normalized = $1
        and requested_at >= $2
      order by requested_at desc`,
    [normalizedEmail, windowStart],
  );

  const decision = evaluateOtpRequestRate(
    rows.map((row) => new Date(row.requested_at)),
    now,
    {
      cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      maxRequests: OTP_MAX_REQUESTS_PER_WINDOW,
      windowSeconds: OTP_REQUEST_WINDOW_SECONDS,
    },
  );

  if (!decision.allowed) {
    return decision;
  }

  await pool.query(
    `insert into identity_otp_request (email_normalized, requested_at) values ($1, $2)`,
    [normalizedEmail, now],
  );

  return decision;
}
