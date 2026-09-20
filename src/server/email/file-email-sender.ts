import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  EmailSender,
  InvitationEmailMessage,
  OtpEmailMessage,
} from "@/server/email/types";

const DEV_EMAIL_DIRECTORY = path.join(process.cwd(), ".dev-emails");

/**
 * Local development fallback used when SMTP is not configured. It writes the
 * message to a file instead of a real inbox, and deliberately never prints it
 * through `console`, so codes and invitation links never reach application
 * logs.
 */
export function createFileEmailSender(): EmailSender {
  async function write(fileName: string, body: string): Promise<void> {
    await mkdir(DEV_EMAIL_DIRECTORY, { recursive: true });
    await writeFile(path.join(DEV_EMAIL_DIRECTORY, fileName), body, "utf8");
  }

  return {
    async sendOtpEmail({ to, otp, type }: OtpEmailMessage): Promise<void> {
      const safeEmail = to.replace(/[^a-z0-9@.-]/gi, "_");
      await write(
        `${Date.now()}-${type}-${safeEmail}.txt`,
        `To: ${to}\nType: ${type}\nOTP: ${otp}\n`,
      );
    },
    async sendInvitationEmail({
      auctionTitle,
      link,
      teamName,
      to,
    }: InvitationEmailMessage): Promise<void> {
      const safeEmail = to.replace(/[^a-z0-9@.-]/gi, "_");
      await write(
        `${Date.now()}-invitation-${safeEmail}.txt`,
        `To: ${to}\nType: invitation\nAuction: ${auctionTitle}\nTeam: ${teamName}\nLink: ${link}\n`,
      );
    },
  };
}
