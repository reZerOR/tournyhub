import nodemailer from "nodemailer";

import type {
  EmailSender,
  InvitationEmailMessage,
  OtpEmailMessage,
} from "@/server/email/types";

const OTP_EMAIL_SUBJECT: Record<OtpEmailMessage["type"], string> = {
  "change-email": "Confirm your new TournyHub email",
  "email-verification": "Verify your TournyHub email",
  "forget-password": "Reset your TournyHub password",
  "sign-in": "Your TournyHub sign-in code",
};

export interface SmtpConfig {
  from: string;
  host: string;
  password: string;
  port: number;
  user: string;
}

export function createNodemailerEmailSender(config: SmtpConfig): EmailSender {
  const transporter = nodemailer.createTransport({
    auth: { pass: config.password, user: config.user },
    host: config.host,
    port: config.port,
    secure: config.port === 465,
  });

  return {
    async sendOtpEmail({ to, otp, type }: OtpEmailMessage): Promise<void> {
      await transporter.sendMail({
        from: config.from,
        subject: OTP_EMAIL_SUBJECT[type],
        text: `Your TournyHub verification code is ${otp}. It expires in 10 minutes and can be used once.`,
        to,
      });
    },
    async sendInvitationEmail({
      auctionTitle,
      link,
      teamName,
      to,
    }: InvitationEmailMessage): Promise<void> {
      await transporter.sendMail({
        from: config.from,
        subject: `Represent ${teamName} in ${auctionTitle}`,
        text: `You have been invited to represent ${teamName} in ${auctionTitle} on TournyHub.\n\nAccept the invitation: ${link}\n\nThe link works once and expires in seven days.`,
        to,
      });
    },
  };
}
