export type OtpEmailType =
  "sign-in" | "email-verification" | "forget-password" | "change-email";

export interface OtpEmailMessage {
  to: string;
  otp: string;
  type: OtpEmailType;
}

export interface InvitationEmailMessage {
  auctionTitle: string;
  link: string;
  teamName: string;
  to: string;
}

export interface EmailSender {
  sendInvitationEmail(message: InvitationEmailMessage): Promise<void>;
  sendOtpEmail(message: OtpEmailMessage): Promise<void>;
}
