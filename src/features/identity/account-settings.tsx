"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/features/identity/auth-client";

type Appearance = "light" | "dark";

interface UserPreferences {
  appearance: Appearance;
  email: string;
  name: string;
  soundEnabled: boolean;
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

function isSessionNotFresh(error: { code?: string } | null | undefined) {
  return error?.code === "SESSION_NOT_FRESH";
}

function deviceName(userAgent?: null | string): string {
  if (!userAgent) return "Unknown browser";
  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Browser session";
}

function oauthMessage(error?: string): string | null {
  if (!error) return null;
  if (error.toLowerCase() === "email_does_not_match") {
    return "Use the Google identity with the same verified email as this User.";
  }
  return "Google could not update this User. Try again.";
}

export function AccountSettings({
  googleEnabled,
  initialUser,
  oauthError,
}: {
  googleEnabled: boolean;
  initialUser: UserPreferences;
  oauthError?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialUser.name);
  const [appearance, setAppearance] = useState<Appearance>(
    initialUser.appearance,
  );
  const [soundEnabled, setSoundEnabled] = useState(initialUser.soundEnabled);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(oauthMessage(oauthError));
  const [status, setStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const [reauthStep, setReauthStep] = useState<"request" | "verify">("request");
  const [otp, setOtp] = useState("");

  async function loadAccountControls() {
    const [accountsResult, sessionsResult, sessionResult] = await Promise.all([
      authClient.listAccounts(),
      authClient.listSessions(),
      authClient.getSession(),
    ]);

    if (accountsResult.data) {
      setAccounts(accountsResult.data as LinkedAccount[]);
    }
    if (sessionResult.data) {
      setCurrentToken(sessionResult.data.session.token);
    }
    if (sessionsResult.data) {
      setSessions(sessionsResult.data as ActiveSession[]);
      setNeedsReauthentication(false);
    } else if (isSessionNotFresh(sessionsResult.error)) {
      setNeedsReauthentication(true);
    } else if (sessionsResult.error) {
      setError(sessionsResult.error.message ?? "Could not load sessions.");
    }
  }

  useEffect(() => {
    async function run() {
      await loadAccountControls();
    }
    void run();
  }, []);

  async function savePreferences(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    const displayName = name.trim();
    if (!displayName) {
      setError("Enter a display name.");
      return;
    }

    setPendingAction("preferences");
    const { error: updateError } = await authClient.updateUser({
      appearance,
      name: displayName,
      soundEnabled,
    });
    setPendingAction(null);

    if (updateError) {
      setError(updateError.message ?? "Could not save preferences.");
      return;
    }

    setName(displayName);
    document.documentElement.classList.toggle("dark", appearance === "dark");
    setStatus("Preferences saved.");
    router.refresh();
  }

  async function linkGoogle() {
    setError(null);
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
    setError(null);
    setPendingAction("request-reauth");
    const { error: requestError } =
      await authClient.emailOtp.sendVerificationOtp({
        email: initialUser.email,
        type: "sign-in",
      });
    setPendingAction(null);

    if (requestError) {
      setError(requestError.message ?? "Could not send a sign-in code.");
    } else setReauthStep("verify");
  }

  async function verifyReauthentication(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPendingAction("verify-reauth");
    const { error: verificationError } = await authClient.signIn.emailOtp({
      email: initialUser.email,
      otp,
    });
    setPendingAction(null);

    if (verificationError) {
      setError(verificationError.message ?? "Could not confirm that code.");
      return;
    }

    setOtp("");
    setReauthStep("request");
    setNeedsReauthentication(false);
    setStatus("Identity confirmed.");
    await loadAccountControls();
    router.refresh();
  }

  async function revokeSession(token: string) {
    setError(null);
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account settings
        </h1>
        <p className="text-muted-foreground">
          Manage your profile, preferences, sign-in methods, and sessions.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not complete that action</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {status && <p role="status">{status}</p>}

      {needsReauthentication && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Confirm your identity
            </CardTitle>
            <CardDescription>
              Account access changes need a sign-in completed in the last ten
              minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reauthStep === "request" ? (
              <Button
                disabled={pendingAction === "request-reauth"}
                onClick={requestReauthentication}
                type="button"
              >
                {pendingAction === "request-reauth" && (
                  <Spinner data-icon="inline-start" />
                )}
                Send a sign-in code
              </Button>
            ) : (
              <form onSubmit={verifyReauthentication}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="reauth-code">Sign-in code</FieldLabel>
                    <Input
                      id="reauth-code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setOtp(event.target.value.replace(/\D/g, ""))
                      }
                      required
                      value={otp}
                    />
                  </Field>
                  <Button
                    disabled={pendingAction === "verify-reauth"}
                    type="submit"
                  >
                    {pendingAction === "verify-reauth" && (
                      <Spinner data-icon="inline-start" />
                    )}
                    Confirm identity
                  </Button>
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Profile and preferences
          </CardTitle>
          <CardDescription>
            These settings apply to every signed-in session.
          </CardDescription>
        </CardHeader>
        <form onSubmit={savePreferences}>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!name.trim()}>
                <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                <Input
                  aria-invalid={!name.trim()}
                  id="display-name"
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
                {!name.trim() && <FieldError>Enter a display name.</FieldError>}
              </Field>
              <Field>
                <FieldLabel>Appearance</FieldLabel>
                <ToggleGroup
                  aria-label="Appearance"
                  onValueChange={(value) => {
                    const nextAppearance = value[0];
                    if (
                      nextAppearance === "light" ||
                      nextAppearance === "dark"
                    ) {
                      setAppearance(nextAppearance);
                    }
                  }}
                  value={[appearance]}
                  variant="outline"
                >
                  <ToggleGroupItem value="light">Light</ToggleGroupItem>
                  <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="sound-enabled">Live sounds</FieldLabel>
                  <FieldDescription>
                    Play auction cues on this User&apos;s signed-in devices.
                    Sounds start off.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  checked={soundEnabled}
                  id="sound-enabled"
                  onCheckedChange={setSoundEnabled}
                />
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={pendingAction === "preferences"} type="submit">
              {pendingAction === "preferences" && (
                <Spinner data-icon="inline-start" />
              )}
              Save preferences
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Google sign-in
          </CardTitle>
          <CardDescription>
            Google must return the same verified email as this User.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span>{initialUser.email}</span>
              <Badge variant={googleAccount ? "secondary" : "outline"}>
                {googleAccount ? "Linked" : "Not linked"}
              </Badge>
            </div>
            {googleAccount ? (
              <Button
                disabled={pendingAction === "unlink-google"}
                onClick={() => unlinkGoogle(googleAccount.id)}
                type="button"
                variant="outline"
              >
                {pendingAction === "unlink-google" && (
                  <Spinner data-icon="inline-start" />
                )}
                Unlink Google
              </Button>
            ) : (
              <Button
                disabled={!googleEnabled || pendingAction === "link-google"}
                onClick={linkGoogle}
                type="button"
                variant="outline"
              >
                {pendingAction === "link-google" && (
                  <Spinner data-icon="inline-start" />
                )}
                Link Google
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Active sessions
          </CardTitle>
          <CardDescription>
            Revoke devices you no longer use. A revoked session loses access on
            its next request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Session details need a recent sign-in.
            </p>
          ) : (
            <div className="flex flex-col">
              {sessions.map((session, index) => {
                const isCurrent = session.token === currentToken;
                return (
                  <div key={session.id}>
                    {index > 0 && <Separator />}
                    <div className="flex items-center justify-between gap-4 py-4">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {deviceName(session.userAgent)}
                          </span>
                          {isCurrent && (
                            <Badge variant="secondary">Current session</Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Signed in{" "}
                          {new Date(session.createdAt).toLocaleString()}
                          {session.ipAddress ? `, ${session.ipAddress}` : ""}
                        </span>
                      </div>
                      {!isCurrent && (
                        <Button
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-wrap">
          <Button
            disabled={sessions.length < 2 || pendingAction === "other-sessions"}
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
            disabled={pendingAction === "all-sessions"}
            onClick={revokeAllSessions}
            type="button"
            variant="destructive"
          >
            {pendingAction === "all-sessions" && (
              <Spinner data-icon="inline-start" />
            )}
            Sign out all sessions
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
