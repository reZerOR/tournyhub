import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EmailSender, OtpEmailMessage } from "@/server/email/types";

const DEV_EMAIL_DIRECTORY = path.join(process.cwd(), ".dev-emails");

/**
 * Local development fallback used when SMTP is not configured. It writes
 * the OTP to a file instead of a real inbox, and deliberately never prints
 * it through `console`, so codes never reach application logs.
 */
export function createFileEmailSender(): EmailSender {
  return {
    async sendOtpEmail({ to, otp, type }: OtpEmailMessage): Promise<void> {
      await mkdir(DEV_EMAIL_DIRECTORY, { recursive: true });
      const safeEmail = to.replace(/[^a-z0-9@.-]/gi, "_");
      const fileName = `${Date.now()}-${type}-${safeEmail}.txt`;
      await writeFile(
        path.join(DEV_EMAIL_DIRECTORY, fileName),
        `To: ${to}\nType: ${type}\nOTP: ${otp}\n`,
        "utf8",
      );
    },
  };
}
