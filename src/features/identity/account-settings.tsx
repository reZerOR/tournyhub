"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  CircleCheck,
  KeyRound,
  Link2,
  Monitor,
  ShieldCheck,
  Smartphone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/identity/auth-client";
import { GoogleMark } from "@/features/identity/google-mark";

interface AccountProfile {
  email: string;
  name: string;
}

interface ActiveSession {
  createdAt: Date | string;
  expiresAt: Date | string;
  id: string;
  ipAddress?: null | string;
  token: string;
  updatedAt: Date | string;
  userAgent?: null | string;
  userId: string;
}

interface LinkedAccount {
  accountId: string;
  id: string;
  providerId: string;
}

interface DeviceDetails {
  icon: LucideIcon;
  label: string;
}

function isSessionNotFresh(error: { code?: string } | null | undefined) {
  return error?.code === "SESSION_NOT_FRESH";
}

function browserName(userAgent: string): string {
  if (userAgent.includes("Edg/")) return "Edge";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Browser";
}

function deviceDetails(userAgent?: null | string): DeviceDetails {
  if (!userAgent) return { icon: Monitor, label: "Unknown browser" };

  const browser = browserName(userAgent);
  if (/iPhone|iPad|Android|Mobile/i.test(userAgent)) {
    const platform = userAgent.includes("iPhone")
      ? "iPhone"
      : userAgent.includes("iPad")
        ? "iPad"
        : "Mobile device";
    return { icon: Smartphone, label: `${platform} · ${browser}` };
  }

  const platform = userAgent.includes("Windows")
    ? "Windows PC"
    : userAgent.includes("Mac OS")
      ? "Mac"
      : userAgent.includes("Linux")
        ? "Linux PC"
        : "Desktop";

  return { icon: Monitor, label: `${platform} · ${browser}` };
}

function formatSessionDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function oauthMessage(error?: string): string | null {
  if (!error) return null;
  if (error.toLowerCase() === "email_does_not_match") {
    return "Use the Google identity with the same verified email as this User.";
  }
  return "Google could not update this User. Try again.";
}

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function SectionIcon({
  icon: Icon,
  tone = "brand",
}: {
  icon: LucideIcon;
  tone?: "brand" | "danger" | "neutral";
}) {
  const tones = {
    brand: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    neutral: "bg-muted text-muted-foreground",
  } as const;
  return (
    <div
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
    >
      <Icon aria-hidden className="size-5" strokeWidth={1.75} />
    </div>
  );
}

export function AccountSettings({
  googleEnabled,
  initialUser,
  oauthError,
}: {
  googleEnabled: boolean;
  initialUser: AccountProfile;
  oauthError?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialUser.name);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(oauthMessage(oauthError));
  const [status, setStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [accountControlsLoading, setAccountControlsLoading] = useState(true);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const [reauthStep, setReauthStep] = useState<"request" | "verify">("request");
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  async function loadAccountControls() {
    const [accountsResult, sessionsResult, sessionResult] = await Promise.all([
      authClient.listAccounts(),
      authClient.listSessions(),
      authClient.getSession(),
    ]);

    if (accountsResult.data)
      setAccounts(accountsResult.data as LinkedAccount[]);
    if (sessionResult.data) setCurrentToken(sessionResult.data.session.token);
    if (sessionsResult.data) {
      setSessions(sessionsResult.data as ActiveSession[]);
      setNeedsReauthentication(false);
    } else if (isSessionNotFresh(sessionsResult.error)) {
      setNeedsReauthentication(true);
    } else if (sessionsResult.error) {
      setError(sessionsResult.error.message ?? "Could not load sessions.");
    }
    setAccountControlsLoading(false);
  }

  useEffect(() => {
    async function run() {
      await loadAccountControls();
    }
    void run();
  }, []);

  function closeReauthentication() {
    setNeedsReauthentication(false);
    setReauthStep("request");
    setReauthError(null);
    setOtp("");
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const displayName = name.trim();
    if (!displayName) {
      setError("Enter a display name.");
      return;
    }

    setPendingAction("profile");
    const { error: updateError } = await authClient.updateUser({
      name: displayName,
    });
    setPendingAction(null);

    if (updateError) {
      setError(updateError.message ?? "Could not update your profile.");
      return;
    }

    setName(displayName);
    setStatus("Profile updated.");
    router.refresh();
  }

  async function linkGoogle() {
    setError(null);
    setStatus(null);
    setPendingAction("link-google");
    const { error: linkError } = await authClient.linkSocial({
      callbackURL: "/app/account",
      errorCallbackURL: "/app/account",
      provider: "google",
    });

    if (linkError) {
      setPendingAction(null);
      if (isSessionNotFresh(linkError)) setNeedsReauthentication(true);
      else setError(linkError.message ?? "Could not link Google.");
    }
  }

  async function unlinkGoogle(accountId: string) {
    setError(null);
    setStatus(null);
    setPendingAction("unlink-google");
    const { error: unlinkError } = await authClient.unlinkAccount({
      accountId,
    });
    setPendingAction(null);

    if (unlinkError) {
      if (isSessionNotFresh(unlinkError)) setNeedsReauthentication(true);
      else setError(unlinkError.message ?? "Could not unlink Google.");
      return;
    }

    setStatus("Google identity unlinked.");
    await loadAccountControls();
  }

  async function requestReauthentication() {
    setReauthError(null);
    setPendingAction("request-reauth");
    const { error: requestError } =
      await authClient.emailOtp.sendVerificationOtp({
        email: initialUser.email,
        type: "sign-in",
      });
    setPendingAction(null);

    if (requestError) {
      setReauthError(requestError.message ?? "Could not send a sign-in code.");
    } else {
      setReauthStep("verify");
    }
  }

  async function verifyReauthentication(event: React.FormEvent) {
    event.preventDefault();
    setReauthError(null);
    setPendingAction("verify-reauth");
    const { error: verificationError } = await authClient.signIn.emailOtp({
      email: initialUser.email,
      otp,
    });
    setPendingAction(null);

    if (verificationError) {
      setReauthError(
        verificationError.message ?? "Could not confirm that code.",
      );
      return;
    }

    closeReauthentication();
    setStatus("Identity confirmed.");
    await loadAccountControls();
    router.refresh();
  }

  async function revokeSession(token: string) {
    setError(null);
    setStatus(null);
    setPendingAction(token);
    const { error: revokeError } = await authClient.revokeSession({ token });
    setPendingAction(null);

    if (revokeError) {
      if (isSessionNotFresh(revokeError)) setNeedsReauthentication(true);
      else setError(revokeError.message ?? "Could not revoke that session.");
      return;
    }
    setStatus("Session revoked.");
    await loadAccountControls();
  }

  async function revokeOtherSessions() {
    setError(null);
    setStatus(null);
    setPendingAction("other-sessions");
    const { error: revokeError } = await authClient.revokeOtherSessions();
    setPendingAction(null);
    if (revokeError) {
      if (isSessionNotFresh(revokeError)) setNeedsReauthentication(true);
      else
        setError(revokeError.message ?? "Could not sign out other sessions.");
      return;
    }
    setStatus("Other sessions signed out.");
    await loadAccountControls();
  }

  async function revokeAllSessions() {
    setError(null);
    setStatus(null);
    setPendingAction("all-sessions");
    const { error: revokeError } = await authClient.revokeSessions();
    if (revokeError) {
      setPendingAction(null);
      if (isSessionNotFresh(revokeError)) setNeedsReauthentication(true);
      else setError(revokeError.message ?? "Could not sign out all sessions.");
      return;
    }
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  const googleAccount = accounts.find(
    (account) => account.providerId === "google",
  );
  const nameInvalid = name.length > 0 && !name.trim();
  const displayLabel = name.trim() || initialUser.name || initialUser.email;
  const currentSession = sessions.find(
    (session) => session.token === currentToken,
  );
  const currentDevice = currentSession
    ? deviceDetails(currentSession.userAgent).label
    : null;
  const sessionCountLabel = accountControlsLoading
    ? "Counting sessions"
    : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`;
  const googleLabel = accountControlsLoading
    ? "Checking Google"
    : googleAccount
      ? "Google linked"
      : "Google not linked";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-9">
      <div className="flex items-center gap-4">
        <Avatar className="size-13 shrink-0 ring-1 ring-neon/40" size="lg">
          <AvatarFallback className="bg-neon/15 text-lg font-semibold text-neon">
            {initials(displayLabel, initialUser.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {displayLabel}
          </h1>
          <p className="truncate text-sm text-muted-foreground">
            {initialUser.email}
            {currentDevice ? ` · This device: ${currentDevice}` : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="success">Verified email</Badge>
            <Badge variant={googleAccount ? "success" : "outline"}>
              {googleLabel}
            </Badge>
            <Badge variant="secondary">{sessionCountLabel}</Badge>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not complete that action</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {status && (
        <Alert role="status" variant="success">
          <CircleCheck />
          <AlertTitle>{status}</AlertTitle>
        </Alert>
      )}

      <div className="dashboard-panel overflow-hidden rounded-xl">
        <section
          aria-labelledby="account-profile-heading"
          className="p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <SectionIcon icon={UserRound} />
            <div className="min-w-0 flex-1">
              <h2
                className="text-base font-semibold tracking-tight"
                id="account-profile-heading"
              >
                Profile
              </h2>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
                Display name shown across Auctions and Teams.
              </p>
            </div>
          </div>
          <form className="mt-4 flex flex-col" onSubmit={saveProfile}>
            <FieldGroup className="max-w-md">
              <Field data-invalid={nameInvalid}>
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <Input
                  aria-invalid={nameInvalid}
                  id="display-name"
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your name"
                  required
                  value={name}
                />
                {nameInvalid && <FieldError>Enter a display name.</FieldError>}
              </Field>
              <Field data-disabled>
                <FieldLabel htmlFor="account-email">Email</FieldLabel>
                <Input
                  disabled
                  id="account-email"
                  type="email"
                  value={initialUser.email}
                />
                <FieldDescription>
                  Your verified email cannot be changed.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <div className="mt-4 flex justify-end">
              <Button
                disabled={!name.trim() || pendingAction === "profile"}
                type="submit"
              >
                {pendingAction === "profile" && (
                  <Spinner data-icon="inline-start" />
                )}
                Save profile
              </Button>
            </div>
          </form>
        </section>

        <Separator />

        <section
          aria-labelledby="account-sessions-heading"
          className="p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <SectionIcon icon={KeyRound} />
            <div className="min-w-0 flex-1">
              <h2
                className="text-base font-semibold tracking-tight"
                id="account-sessions-heading"
              >
                Active sessions
              </h2>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
                Devices that can act as you. Revoke anything unfamiliar.
              </p>
            </div>
            {!accountControlsLoading && sessions.length > 0 && (
              <Badge className="shrink-0 tabular-nums" variant="secondary">
                {sessions.length}
              </Badge>
            )}
          </div>

          <div className="mt-2">
            {accountControlsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Spinner />
                Loading sessions...
              </div>
            ) : sessions.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Session details need a recent sign-in.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {sessions.map((session) => {
                  const isCurrent = session.token === currentToken;
                  const device = deviceDetails(session.userAgent);
                  const DeviceIcon = device.icon;

                  return (
                    <li
                      className="flex items-center gap-3 py-4"
                      key={session.id}
                    >
                      <div
                        className={
                          isCurrent
                            ? "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                            : "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                        }
                      >
                        <DeviceIcon
                          aria-hidden
                          className="size-5"
                          strokeWidth={1.75}
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-medium">
                            {device.label}
                          </span>
                          {isCurrent && (
                            <Badge variant="success">Current session</Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Active {formatSessionDate(session.createdAt)} · IP{" "}
                          {session.ipAddress ?? "unavailable"}
                        </span>
                      </div>
                      {!isCurrent && (
                        <Button
                          className="shrink-0 cursor-pointer"
                          disabled={pendingAction === session.token}
                          onClick={() => revokeSession(session.token)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {pendingAction === session.token && (
                            <Spinner data-icon="inline-start" />
                          )}
                          Revoke
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              className="cursor-pointer"
              disabled={
                accountControlsLoading ||
                sessions.length < 2 ||
                pendingAction === "other-sessions"
              }
              onClick={revokeOtherSessions}
              type="button"
              variant="outline"
            >
              {pendingAction === "other-sessions" && (
                <Spinner data-icon="inline-start" />
              )}
              Sign out other sessions
            </Button>
            <Button
              className="cursor-pointer"
              disabled={
                accountControlsLoading || pendingAction === "all-sessions"
              }
              onClick={revokeAllSessions}
              type="button"
              variant="destructive"
            >
              {pendingAction === "all-sessions" && (
                <Spinner data-icon="inline-start" />
              )}
              Sign out all sessions
            </Button>
          </div>
        </section>

        <Separator />

        <section
          aria-labelledby="account-connected-heading"
          className="p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <SectionIcon icon={Link2} tone="neutral" />
            <div className="min-w-0 flex-1">
              <h2
                className="text-base font-semibold tracking-tight"
                id="account-connected-heading"
              >
                Connected accounts
              </h2>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">
                A second way in, using the same verified email.
              </p>
            </div>
            <Badge
              variant={
                accountControlsLoading
                  ? "secondary"
                  : googleAccount
                    ? "success"
                    : "outline"
              }
            >
              {accountControlsLoading
                ? "Checking"
                : googleAccount
                  ? "Linked"
                  : "Not linked"}
            </Badge>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <GoogleMark className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">Google</span>
                <span className="truncate text-sm text-muted-foreground">
                  {initialUser.email}
                </span>
              </div>
            </div>

            {googleAccount ? (
              <Button
                className="w-fit cursor-pointer"
                disabled={pendingAction === "unlink-google"}
                onClick={() => unlinkGoogle(googleAccount.id)}
                type="button"
                variant="destructive"
              >
                {pendingAction === "unlink-google" && (
                  <Spinner data-icon="inline-start" />
                )}
                Unlink Google
              </Button>
            ) : (
              <Button
                className="w-fit cursor-pointer"
                disabled={
                  accountControlsLoading ||
                  !googleEnabled ||
                  pendingAction === "link-google"
                }
                onClick={linkGoogle}
                type="button"
                variant="outline"
              >
                {pendingAction === "link-google" && (
                  <Spinner data-icon="inline-start" />
                )}
                <GoogleMark data-icon="inline-start" />
                Link Google
              </Button>
            )}
          </div>
          {!googleEnabled && (
            <p className="mt-3 text-sm text-muted-foreground">
              Google sign-in is not configured in this environment.
            </p>
          )}
        </section>
      </div>

      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          Revoking sessions or changing linked accounts can ask for a 6-digit
          code sent to {initialUser.email}. The page stays put while you
          confirm.
        </span>
      </p>

      <Dialog
        onOpenChange={(open) => {
          if (!open) closeReauthentication();
        }}
        open={needsReauthentication}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify it&apos;s you</DialogTitle>
            <DialogDescription>
              {reauthStep === "request"
                ? `Send a 6-digit code to ${initialUser.email} before changing account access.`
                : `Enter the 6-digit code sent to ${initialUser.email}.`}
            </DialogDescription>
          </DialogHeader>

          {reauthError && (
            <Alert variant="destructive">
              <AlertTitle>Could not verify your identity</AlertTitle>
              <AlertDescription>{reauthError}</AlertDescription>
            </Alert>
          )}

          {reauthStep === "request" ? (
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                disabled={pendingAction === "request-reauth"}
                onClick={requestReauthentication}
                type="button"
              >
                {pendingAction === "request-reauth" && (
                  <Spinner data-icon="inline-start" />
                )}
                Send code
              </Button>
            </DialogFooter>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={verifyReauthentication}
            >
              <Field>
                <FieldLabel htmlFor="reauth-code">6-digit code</FieldLabel>
                <InputOTP
                  id="reauth-code"
                  aria-label="6-digit code"
                  autoComplete="one-time-code"
                  containerClassName="justify-center"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(value) => setOtp(value.replace(/\D/g, ""))}
                  pattern={REGEXP_ONLY_DIGITS}
                  required
                  value={otp}
                >
                  <InputOTPGroup className="gap-2">
                    {Array.from({ length: 6 }, (_, index) => (
                      <InputOTPSlot
                        className="size-11 rounded-lg border-l text-base"
                        index={index}
                        key={index}
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </Field>
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="outline" />}
                >
                  Cancel
                </DialogClose>
                <Button
                  disabled={
                    otp.length !== 6 || pendingAction === "verify-reauth"
                  }
                  type="submit"
                >
                  {pendingAction === "verify-reauth" && (
                    <Spinner data-icon="inline-start" />
                  )}
                  Verify
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
