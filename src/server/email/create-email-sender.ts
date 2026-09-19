import { createFileEmailSender } from "@/server/email/file-email-sender";
import {
  createNodemailerEmailSender,
  type SmtpConfig,
} from "@/server/email/nodemailer-email-sender";
import type { EmailSender } from "@/server/email/types";
import { serverEnv } from "@/config/server-env";

function readSmtpConfig(): SmtpConfig | null {
  const { EMAIL_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER } =
    serverEnv;

  if (!EMAIL_FROM || !SMTP_HOST || !SMTP_PASSWORD || !SMTP_PORT || !SMTP_USER) {
    return null;
  }

  return {
    from: EMAIL_FROM,
    host: SMTP_HOST,
    password: SMTP_PASSWORD,
    port: SMTP_PORT,
    user: SMTP_USER,
  };
}

export function createDefaultEmailSender(): EmailSender {
  const smtpConfig = readSmtpConfig();

  if (smtpConfig) {
    return createNodemailerEmailSender(smtpConfig);
  }

  if (process.env.NODE_ENV === "production") {
    // Deferred to first use rather than thrown here: this factory runs at
    // module load time, including during `next build`'s page-data
    // collection, which must succeed without production secrets.
    return {
      async sendOtpEmail() {
        throw new Error(
          "SMTP is not configured. Set EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD before deploying.",
        );
      },
    };
  }

  return createFileEmailSender();
}
