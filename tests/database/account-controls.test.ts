import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { serverEnv } from "@/config/server-env";
import { createAuth } from "@/server/auth/auth";
import { getPool } from "@/server/database/pool";
import type { OtpEmailMessage } from "@/server/email/types";

const pool = getPool();
const baseURL = serverEnv.NEXT_PUBLIC_APP_URL;
const testEmailPrefix = "account-test-";

interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name: string;
  subject: string;
}

interface CallResult {
  json: Record<string, unknown> | null;
  response: Response;
  status: number;
}

function uniqueEmail(label: string): string {
  return `${testEmailPrefix}${label}-${randomUUID()}@example.com`;
}

function uniqueIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

function createFakeEmailSender() {
  const sent: OtpEmailMessage[] = [];
  return {
    sender: {
      async sendOtpEmail(message: OtpEmailMessage): Promise<void> {
        sent.push(message);
      },
    },
    sent,
  };
}

async function callAuth(
  auth: ReturnType<typeof createAuth>,
  path: string,
  body?: unknown,
  {
    cookie,
    ip = uniqueIp(),
    method = "POST",
  }: { cookie?: string; ip?: string; method?: "GET" | "POST" } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {
    origin: baseURL,
    "x-forwarded-for": ip,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;

  const response = await auth.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    }),
  );

  const json =
    response.status === 204 || response.headers.get("content-length") === "0"
      ? null
      : ((await response
          .clone()
          .json()
          .catch(() => null)) as Record<string, unknown> | null);

  return { json, response, status: response.status };
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
}

async function signInWithOtp(
  auth: ReturnType<typeof createAuth>,
  email: string,
): Promise<string> {
  await pool.query(
    `delete from identity_otp_request where email_normalized = $1`,
    [email.toLowerCase()],
  );
  const { sender, sent } = createFakeEmailSender();
  const authWithSender = createAuth({
    emailSender: sender,
    google: {
      clientId: "test-google-client",
      clientSecret: "test-google-secret",
    },
  });
  const send = await callAuth(
    authWithSender,
    "/email-otp/send-verification-otp",
    { email, type: "sign-in" },
  );
  expect(send.status).toBe(200);

  const signIn = await callAuth(authWithSender, "/sign-in/email-otp", {
    email,
    otp: sent[0]?.otp,
  });
  expect(signIn.status).toBe(200);

  // Keep the caller's auth instance live so this helper catches mismatched
  // database/configuration behavior while returning a portable cookie.
  expect(
    await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeaderFrom(signIn.response) }),
    }),
  ).not.toBeNull();

  return cookieHeaderFrom(signIn.response);
}

async function beginGoogleFlow(
  auth: ReturnType<typeof createAuth>,
  { cookie, link = false }: { cookie?: string; link?: boolean } = {},
) {
  const path = link ? "/link-social" : "/sign-in/social";
  const start = await callAuth(
    auth,
    path,
    {
      callbackURL: `${baseURL}/app`,
      errorCallbackURL: `${baseURL}/sign-in`,
      provider: "google",
    },
    { cookie },
  );
  expect(start.status).toBe(200);

  const authorizationURL = new URL(String(start.json?.url));
  return {
    cookie: cookieHeaderFrom(start.response),
    state: authorizationURL.searchParams.get("state"),
  };
}

async function finishGoogleFlow(
  auth: ReturnType<typeof createAuth>,
  flow: { cookie: string; state: string | null },
) {
  expect(flow.state).toBeTruthy();
  return callAuth(
    auth,
    `/callback/google?code=test-code&state=${encodeURIComponent(flow.state ?? "")}`,
    undefined,
    { cookie: flow.cookie, method: "GET" },
  );
}

function createGoogleAuth(profile: GoogleProfile) {
  const { sender } = createFakeEmailSender();
  const now = Math.floor(Date.now() / 1000);
  return createAuth({
    emailSender: sender,
    google: {
      clientId: "test-google-client",
      clientSecret: "test-google-secret",
      async getUserInfo() {
        return {
          data: {
            aud: "test-google-client",
            azp: "test-google-client",
            email: profile.email,
            email_verified: profile.emailVerified,
            exp: now + 3600,
            family_name: "User",
            given_name: "Google",
            iat: now,
            iss: "https://accounts.google.com",
            name: profile.name,
            picture: "https://example.com/avatar.png",
            sub: profile.subject,
          },
          user: {
            email: profile.email,
            emailVerified: profile.emailVerified,
            image: undefined,
            name: profile.name,
          },
        };
      },
    },
  });
}

function mockGoogleTokenExchange() {
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({
        access_token: "google-access-token",
        expires_in: 3600,
        id_token: "test-id-token",
        scope: "openid email profile",
        token_type: "Bearer",
      });
    }

    return originalFetch(input, init);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

describe("Google sign-in", () => {
  it("registers a new User and signs the same Google identity back in", async () => {
    const email = uniqueEmail("google-register");
    const auth = createGoogleAuth({
      email,
      emailVerified: true,
      name: "Google User",
      subject: randomUUID(),
    });
    mockGoogleTokenExchange();

    const firstCallback = await finishGoogleFlow(
      auth,
      await beginGoogleFlow(auth),
    );
    expect(firstCallback.status).toBe(302);
    const firstCookie = cookieHeaderFrom(firstCallback.response);
    const firstSession = await auth.api.getSession({
      headers: new Headers({ cookie: firstCookie }),
    });
    expect(firstSession?.user).toMatchObject({
      email,
      emailVerified: true,
      name: "Google User",
    });

    const secondCallback = await finishGoogleFlow(
      auth,
      await beginGoogleFlow(auth),
    );
    const secondSession = await auth.api.getSession({
      headers: new Headers({
        cookie: cookieHeaderFrom(secondCallback.response),
      }),
    });
    expect(secondSession?.user.id).toBe(firstSession?.user.id);
  });

  it("links an existing User only when Google supplies the same verified email", async () => {
    const email = uniqueEmail("google-link");
    const profile: GoogleProfile = {
      email,
      emailVerified: true,
      name: "Google Name",
      subject: randomUUID(),
    };
    const auth = createGoogleAuth(profile);
    const cookie = await signInWithOtp(auth, email);
    mockGoogleTokenExchange();

    const callback = await finishGoogleFlow(auth, await beginGoogleFlow(auth));
    expect(callback.status).toBe(302);

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookieHeaderFrom(callback.response) }),
    });
    const accounts = await auth.api.listUserAccounts({
      headers: new Headers({ cookie }),
    });
    expect(session?.user.id).toBe(
      (await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user
        .id,
    );
    expect(accounts).toEqual([
      expect.objectContaining({
        accountId: profile.subject,
        providerId: "google",
      }),
    ]);
  });

  it("rejects an unverified same-email Google identity", async () => {
    const email = uniqueEmail("google-unverified");
    const auth = createGoogleAuth({
      email,
      emailVerified: false,
      name: "Unverified User",
      subject: randomUUID(),
    });
    const cookie = await signInWithOtp(auth, email);
    mockGoogleTokenExchange();

    const callback = await finishGoogleFlow(auth, await beginGoogleFlow(auth));

    expect(callback.status).toBe(302);
    expect(callback.response.headers.get("location")).toContain(
      "error=account_not_linked",
    );
    expect(
      await auth.api.listUserAccounts({ headers: new Headers({ cookie }) }),
    ).toEqual([]);
  });

  it("returns a callback error without OAuth state", async () => {
    const auth = createGoogleAuth({
      email: uniqueEmail("callback-failure"),
      emailVerified: true,
      name: "Callback User",
      subject: randomUUID(),
    });

    const callback = await callAuth(
      auth,
      "/callback/google?code=test-code",
      undefined,
      { method: "GET" },
    );

    expect(callback.status).toBe(302);
    expect(callback.response.headers.get("location")).toContain(
      "error=state_not_found",
    );
  });
});

describe("User account controls", () => {
  it("persists the required display name and preferences across sessions", async () => {
    const email = uniqueEmail("preferences");
    const auth = createGoogleAuth({
      email,
      emailVerified: true,
      name: "Unused",
      subject: randomUUID(),
    });
    const firstCookie = await signInWithOtp(auth, email);

    const update = await callAuth(
      auth,
      "/update-user",
      {
        appearance: "dark",
        name: "  Tournament Director  ",
        soundEnabled: true,
      },
      { cookie: firstCookie },
    );
    expect(update.status).toBe(200);
    expect(update.json).toEqual({ status: true });

    const secondCookie = await signInWithOtp(auth, email);
    const laterSession = await auth.api.getSession({
      headers: new Headers({ cookie: secondCookie }),
    });
    expect(laterSession?.user).toMatchObject({
      appearance: "dark",
      name: "Tournament Director",
      soundEnabled: true,
    });
  });

  it("requires a recent session before starting a manual account link", async () => {
    const email = uniqueEmail("stale-link");
    const auth = createGoogleAuth({
      email,
      emailVerified: true,
      name: "Stale User",
      subject: randomUUID(),
    });
    const cookie = await signInWithOtp(auth, email);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    await pool.query(
      `update "session"
          set "createdAt" = now() - interval '11 minutes'
        where id = $1`,
      [session?.session.id],
    );

    const link = await callAuth(
      auth,
      "/link-social",
      { callbackURL: `${baseURL}/app`, provider: "google" },
      { cookie },
    );

    expect(link.status).toBe(403);
    expect(link.json).toMatchObject({ code: "SESSION_NOT_FRESH" });
  });

  it("does not let an unrelated User unlink another User's Google identity", async () => {
    const ownerEmail = uniqueEmail("link-owner");
    const auth = createGoogleAuth({
      email: ownerEmail,
      emailVerified: true,
      name: "Owner",
      subject: randomUUID(),
    });
    const ownerCookie = await signInWithOtp(auth, ownerEmail);
    mockGoogleTokenExchange();
    await finishGoogleFlow(auth, await beginGoogleFlow(auth, { link: false }));
    const [googleAccount] = await auth.api.listUserAccounts({
      headers: new Headers({ cookie: ownerCookie }),
    });

    const unrelatedCookie = await signInWithOtp(auth, uniqueEmail("unrelated"));
    const unlink = await callAuth(
      auth,
      "/unlink-account",
      { accountId: googleAccount?.id },
      { cookie: unrelatedCookie },
    );

    expect(unlink.status).toBe(400);
    expect(unlink.json).toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    expect(
      await auth.api.listUserAccounts({
        headers: new Headers({ cookie: ownerCookie }),
      }),
    ).toEqual([expect.objectContaining({ id: googleAccount?.id })]);
  });

  it("lists sessions and revokes another session immediately", async () => {
    const email = uniqueEmail("sessions");
    const auth = createGoogleAuth({
      email,
      emailVerified: true,
      name: "Session User",
      subject: randomUUID(),
    });
    const firstCookie = await signInWithOtp(auth, email);
    const secondCookie = await signInWithOtp(auth, email);
    const secondSession = await auth.api.getSession({
      headers: new Headers({ cookie: secondCookie }),
    });

    const sessions = await auth.api.listSessions({
      headers: new Headers({ cookie: firstCookie }),
    });
    expect(sessions).toHaveLength(2);

    const revoke = await callAuth(
      auth,
      "/revoke-session",
      { token: secondSession?.session.token },
      { cookie: firstCookie },
    );
    expect(revoke.status).toBe(200);

    const revokedRequest = await callAuth(auth, "/get-session", undefined, {
      cookie: secondCookie,
      method: "GET",
    });
    expect(revokedRequest.status).toBe(200);
    expect(revokedRequest.json).toBeNull();
    expect(revokedRequest.response.headers.getSetCookie()).not.toHaveLength(0);
    expect(
      revokedRequest.response.headers
        .getSetCookie()
        .every((cookie) => cookie.includes("Max-Age=0")),
    ).toBe(true);
  });

  it("can revoke every other session or every session including the current one", async () => {
    const email = uniqueEmail("session-groups");
    const auth = createGoogleAuth({
      email,
      emailVerified: true,
      name: "Session User",
      subject: randomUUID(),
    });
    const firstCookie = await signInWithOtp(auth, email);
    const secondCookie = await signInWithOtp(auth, email);

    const revokeOther = await callAuth(
      auth,
      "/revoke-other-sessions",
      {},
      { cookie: firstCookie },
    );
    expect(revokeOther.status).toBe(200);
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: firstCookie }),
      }),
    ).not.toBeNull();
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: secondCookie }),
      }),
    ).toBeNull();

    const revokeAll = await callAuth(
      auth,
      "/revoke-sessions",
      {},
      { cookie: firstCookie },
    );
    expect(revokeAll.status).toBe(200);
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: firstCookie }),
      }),
    ).toBeNull();
  });
});
