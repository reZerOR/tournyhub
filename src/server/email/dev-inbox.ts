import type { EmailSender, OtpEmailMessage } from "@/server/email/types";

interface DevInboxEntry {
  otp: string;
  sentAt: number;
}

declare global {
  var __tournyhubDevOtpInbox: Map<string, DevInboxEntry> | undefined;
}

function inbox(): Map<string, DevInboxEntry> {
  globalThis.__tournyhubDevOtpInbox ??= new Map();
  return globalThis.__tournyhubDevOtpInbox;
}

function inboxKey(email: string, type: OtpEmailMessage["type"]): string {
  return `${type}:${email.trim().toLowerCase()}`;
}

/**
 * Records the last OTP sent per email/type so non-production tooling
 * (browser tests, local development) can retrieve a code that was never
 * really emailed. Never wired up in production.
 */
export function recordDevOtp({ to, otp, type }: OtpEmailMessage): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  inbox().set(inboxKey(to, type), { otp, sentAt: Date.now() });
}

export function readDevOtp(
  email: string,
  type: OtpEmailMessage["type"],
): string | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return inbox().get(inboxKey(email, type))?.otp ?? null;
}

/**
 * Wraps an `EmailSender` so every OTP it sends is also recorded in the
 * dev inbox. Keeps the dev-only recording behind the same `EmailSender`
 * seam as real delivery, instead of the auth config calling it directly.
 */
export function withDevInboxRecording(sender: EmailSender): EmailSender {
  return {
    async sendOtpEmail(message: OtpEmailMessage): Promise<void> {
      recordDevOtp(message);
      await sender.sendOtpEmail(message);
    },
  };
}
