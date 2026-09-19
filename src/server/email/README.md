# Email

The `EmailSender` interface (`types.ts`) is the provider boundary described
in the architecture doc. `create-email-sender.ts` picks the Nodemailer
implementation when SMTP is configured, or a local file-based fallback
otherwise. `dev-inbox.ts` is a non-production-only in-memory record of the
last OTP sent per email, used by local development and browser tests; it is
never populated or read in production.
