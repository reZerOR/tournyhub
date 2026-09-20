import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { serverEnv } from "@/config/server-env";
import { createAuth } from "@/server/auth/auth";
import { getPool } from "@/server/database/pool";
import type { OtpEmailMessage } from "@/server/email/types";

const pool = getPool();
const baseURL = serverEnv.NEXT_PUBLIC_APP_URL;
const testEmailPrefix = "otp-test-";

function uniqueEmail(label: string): string {
  return `${testEmailPrefix}${label}-${randomUUID()}@example.com`;
}

function createFakeEmailSender() {
  const sent: OtpEmailMessage[] = [];
  return {
    sender: {
      async sendInvitationEmail(): Promise<void> {},
      async sendOtpEmail(message: OtpEmailMessage): Promise<void> {
        sent.push(message);
      },
    },
    sent,
  };
}

function otpIdentifier(email: string): string {
  return `sign-in-otp-${email}`;
}

async function expireOtp(email: string): Promise<void> {
  await pool.query(
    `update "verification" set "expiresAt" = now() - interval '1 minute' where "identifier" = $1`,
    [otpIdentifier(email)],
  );
}

async function clearOtpRequestLog(email: string): Promise<void> {
  await pool.query(
    `delete from identity_otp_request where email_normalized = $1`,
    [email],
  );
}

async function backdateOtpRequestLog(
  email: string,
  secondsAgo: number,
): Promise<void> {
  await pool.query(
    `update identity_otp_request
        set requested_at = now() - ($2 || ' seconds')::interval
      where email_normalized = $1`,
    [email, secondsAgo],
  );
}

interface CallResult {
  json: Record<string, unknown> | null;
  response: Response;
  status: number;
}

async function callAuth(
  auth: ReturnType<typeof createAuth>,
  path: string,
  body: unknown,
  { cookie, ip }: { cookie?: string; ip?: string } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: baseURL,
  };
  if (ip) headers["x-forwarded-for"] = ip;
  if (cookie) headers.cookie = cookie;

  const response = await auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    }),
  );

  const json =
    response.status === 204
      ? null
      : ((await response.json().catch(() => null)) as Record<
          string,
          unknown
        > | null);

  return { json, response, status: response.status };
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
}

function uniqueIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

afterAll(async () => {
  await pool.query(`delete from "verification" where "identifier" like $1`, [
    `%${testEmailPrefix}%`,
  ]);
  await pool.query(`delete from "user" where "email" like $1`, [
    `${testEmailPrefix}%`,
  ]);
  await pool.query(
    `delete from identity_otp_request where email_normalized like $1`,
    [`${testEmailPrefix}%`],
  );
});

describe("email OTP sign-in", () => {
  it("registers a new user and signs them in with a valid code", async () => {
    const email = uniqueEmail("register");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    const sendResult = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    expect(sendResult.status).toBe(200);
    expect(sendResult.json).toEqual({ success: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.otp).toMatch(/^\d{6}$/);

    const signInResult = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );
    expect(signInResult.status).toBe(200);
    expect(signInResult.json).toMatchObject({
      user: { email, emailVerified: true },
    });
    expect(cookieHeaderFrom(signInResult.response)).toContain("tournyhub");

    const stored = await pool.query<{ email: string }>(
      `select email from "user" where email = $1`,
      [email],
    );
    expect(stored.rows).toHaveLength(1);
  });

  it("signs a returning user back in without creating a duplicate account", async () => {
    const email = uniqueEmail("returning");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    const firstSignIn = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );
    const firstUserId = (firstSignIn.json?.user as { id: string })?.id;

    await clearOtpRequestLog(email);
    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    const secondSignIn = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[1]?.otp },
      { ip },
    );

    expect(secondSignIn.status).toBe(200);
    expect((secondSignIn.json?.user as { id: string })?.id).toBe(firstUserId);

    const stored = await pool.query<{ count: string }>(
      `select count(*)::text as count from "user" where email = $1`,
      [email],
    );
    expect(stored.rows[0]?.count).toBe("1");
  });

  it("responds identically whether or not the email is already registered", async () => {
    const { sender: registeredSender, sent: registeredSent } =
      createFakeEmailSender();
    const registeredAuth = createAuth({ emailSender: registeredSender });
    const registeredEmail = uniqueEmail("known");
    const setupIp = uniqueIp();
    await callAuth(
      registeredAuth,
      "/email-otp/send-verification-otp",
      { email: registeredEmail, type: "sign-in" },
      { ip: setupIp },
    );
    await callAuth(
      registeredAuth,
      "/sign-in/email-otp",
      { email: registeredEmail, otp: registeredSent[0]?.otp },
      { ip: setupIp },
    );

    const { sender } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const newEmail = uniqueEmail("unknown");

    await clearOtpRequestLog(registeredEmail);
    const knownResult = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email: registeredEmail, type: "sign-in" },
      { ip: uniqueIp() },
    );
    const unknownResult = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email: newEmail, type: "sign-in" },
      { ip: uniqueIp() },
    );

    expect(knownResult.status).toBe(unknownResult.status);
    expect(knownResult.json).toEqual(unknownResult.json);
  });

  it("rejects a code once it has expired", async () => {
    const email = uniqueEmail("expired");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    await expireOtp(email);

    const result = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );

    expect(result.status).toBe(400);
    expect(result.json).toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("rejects a code that has already been used (replay)", async () => {
    const email = uniqueEmail("replay");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    const first = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );
    expect(first.status).toBe(200);

    const replay = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );
    expect(replay.status).toBe(400);
  });

  it("locks out verification after five incorrect attempts", async () => {
    const email = uniqueEmail("attempts");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await callAuth(
        auth,
        "/sign-in/email-otp",
        { email, otp: "000000" },
        { ip },
      );
      expect(wrong.status).toBe(400);
      expect(wrong.json).toMatchObject({ code: "INVALID_OTP" });
    }

    const lockedOut = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );
    expect(lockedOut.status).toBe(403);
    expect(lockedOut.json).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
  });

  it("enforces a 60-second resend cooldown per normalized email", async () => {
    const email = uniqueEmail("cooldown");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    const first = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    expect(first.status).toBe(200);

    const immediateResend = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    expect(immediateResend.status).toBe(429);
    expect(sent).toHaveLength(1);

    await backdateOtpRequestLog(email, 61);

    const resendAfterCooldown = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    expect(resendAfterCooldown.status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it("rate-limits repeated OTP requests for the same email within an hour", async () => {
    const email = uniqueEmail("hourly-cap");
    const { sender } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });

    for (let i = 0; i < 5; i += 1) {
      await pool.query(
        `insert into identity_otp_request (email_normalized, requested_at)
         values ($1, now() - ($2 || ' seconds')::interval)`,
        [email, (5 - i) * 300],
      );
    }

    const result = await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip: uniqueIp() },
    );

    expect(result.status).toBe(429);
  });

  it("rate-limits repeated OTP requests from the same IP address", async () => {
    const { sender } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();
    const requestCount = 11;

    const results: number[] = [];
    for (let i = 0; i < requestCount; i += 1) {
      const email = uniqueEmail(`ip-${i}`);
      const result = await callAuth(
        auth,
        "/email-otp/send-verification-otp",
        { email, type: "sign-in" },
        { ip },
      );
      results.push(result.status);
    }

    expect(results.slice(0, requestCount - 1)).toEqual(
      new Array(requestCount - 1).fill(200),
    );
    expect(results.at(-1)).toBe(429);
  });

  it("has no password path: password-reset endpoints are blocked and store no password", async () => {
    const email = uniqueEmail("no-password");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );

    const requestReset = await callAuth(
      auth,
      "/email-otp/request-password-reset",
      { email },
      { ip },
    );
    expect(requestReset.status).toBe(404);

    const resetPassword = await callAuth(
      auth,
      "/email-otp/reset-password",
      { email, otp: "000000", password: "a-new-password-123" },
      { ip },
    );
    expect(resetPassword.status).toBe(404);

    const legacyForgetPassword = await callAuth(
      auth,
      "/forget-password/email-otp",
      { email },
      { ip },
    );
    expect(legacyForgetPassword.status).toBe(404);

    const account = await pool.query<{ count: string }>(
      `select count(*)::text as count
         from "account"
        where "userId" = (select id from "user" where email = $1)
          and password is not null`,
      [email],
    );
    expect(account.rows[0]?.count).toBe("0");
  });

  it("denies session access without a valid session cookie", async () => {
    const auth = createAuth({ emailSender: createFakeEmailSender().sender });

    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: "tournyhub.session_token=not-a-real-token",
      }),
    });

    expect(session).toBeNull();
  });

  it("grants session access with a valid session cookie", async () => {
    const email = uniqueEmail("session");
    const { sender, sent } = createFakeEmailSender();
    const auth = createAuth({ emailSender: sender });
    const ip = uniqueIp();

    await callAuth(
      auth,
      "/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      { ip },
    );
    const signIn = await callAuth(
      auth,
      "/sign-in/email-otp",
      { email, otp: sent[0]?.otp },
      { ip },
    );
    const cookie = cookieHeaderFrom(signIn.response);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    expect(session?.user.email).toBe(email);
  });
});
