import type {
  EmailSender,
  InvitationEmailMessage,
  OtpEmailMessage,
} from "@/server/email/types";

interface DevInboxEntry {
  otp: string;
  sentAt: number;
}

interface DevInvitationEntry {
  link: string;
  sentAt: number;
  teamName: string;
}

declare global {
  var __tournyhubDevOtpInbox: Map<string, DevInboxEntry> | undefined;
  var __tournyhubDevInvitationInbox:
    Map<string, DevInvitationEntry> | undefined;
}

function inbox(): Map<string, DevInboxEntry> {
  globalThis.__tournyhubDevOtpInbox ??= new Map();
  return globalThis.__tournyhubDevOtpInbox;
}

function invitationInbox(): Map<string, DevInvitationEntry> {
  globalThis.__tournyhubDevInvitationInbox ??= new Map();
  return globalThis.__tournyhubDevInvitationInbox;
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
 * Records the last invitation link sent per email so browser tests can open
 * it without a real inbox. The raw token only ever exists here in
 * non-production code; the database stores its digest.
 */
export function recordDevInvitation({
  link,
  teamName,
  to,
}: InvitationEmailMessage): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  invitationInbox().set(to.trim().toLowerCase(), {
    link,
    sentAt: Date.now(),
    teamName,
  });
}

export function readDevInvitation(
  email: string,
): null | { link: string; teamName: string } {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const entry = invitationInbox().get(email.trim().toLowerCase());
  return entry ? { link: entry.link, teamName: entry.teamName } : null;
}

/**
 * Wraps an `EmailSender` so every message it sends is also recorded in the
 * dev inbox. Keeps the dev-only recording behind the same `EmailSender`
 * seam as real delivery, instead of the callers reaching in directly.
 */
export function withDevInboxRecording(sender: EmailSender): EmailSender {
  return {
    async sendOtpEmail(message: OtpEmailMessage): Promise<void> {
      recordDevOtp(message);
      await sender.sendOtpEmail(message);
    },
    async sendInvitationEmail(message: InvitationEmailMessage): Promise<void> {
      recordDevInvitation(message);
      await sender.sendInvitationEmail(message);
    },
  };
}
