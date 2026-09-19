export type OtpEmailType =
  "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface OtpEmailMessage {
  to: string;
  otp: string;
  type: OtpEmailType;
}

export interface EmailSender {
  sendOtpEmail(message: OtpEmailMessage): Promise<void>;
}
