"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/identity/auth-client";
import { OTP_RESEND_COOLDOWN_SECONDS } from "@/server/auth/otp-request-log";

type Step = "email" | "otp";

function friendlyErrorMessage(error: {
  code?: string;
  message?: string;
  status?: number;
}): string {
  if (error.status === 429) {
    return "Too many attempts. Please wait before trying again.";
  }

  switch (error.code) {
    case "OTP_EXPIRED":
      return "That code has expired. Request a new one.";
    case "INVALID_OTP":
      return "That code is incorrect. Check it and try again.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many incorrect attempts. Request a new code.";
    default:
      return error.message ?? "Something went wrong. Please try again.";
  }
}

function oauthErrorMessage(error?: string): string | null {
  if (!error) return null;

  switch (error.toLowerCase()) {
    case "email_not_verified":
      return "Google did not verify that email address.";
    case "account_not_linked":
    case "email_does_not_match":
      return "That Google identity cannot be linked to this User.";
    default:
      return "Google sign-in could not be completed. Try again.";
  }
}

export function SignInForm({
  googleEnabled,
  next,
  oauthError,
}: {
  googleEnabled: boolean;
  next?: string;
  oauthError?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    };
  }, []);

  function startCooldown() {
    setCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
    if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    cooldownInterval.current = setInterval(() => {
      setCooldownSeconds((remaining) => {
        if (remaining <= 1) {
          if (cooldownInterval.current) clearInterval(cooldownInterval.current);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
  }

  async function requestCode() {
    setError(null);
    setIsSubmitting(true);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "sign-in",
    });
    setIsSubmitting(false);

    if (sendError) {
      setError(friendlyErrorMessage(sendError));
      return;
    }

    setStep("otp");
    startCooldown();
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function handleOtpSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const { error: signInError } = await authClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp,
    });
    setIsSubmitting(false);

    if (signInError) {
      setError(friendlyErrorMessage(signInError));
      return;
    }

    router.push(next ?? "/app");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsSubmitting(true);
    const { error: googleError } = await authClient.signIn.social({
      callbackURL: next ?? "/app",
      errorCallbackURL: "/sign-in",
      provider: "google",
    });

    if (googleError) {
      setError(
        oauthErrorMessage(googleError.code) ??
          googleError.message ??
          "Google sign-in could not be completed.",
      );
      setIsSubmitting(false);
    }
  }

  if (step === "email") {
    const callbackError = oauthErrorMessage(oauthError);

    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle aria-level={1} role="heading">
            Sign in
          </CardTitle>
          <CardDescription>
            We&apos;ll email you a one-time code. No password needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <form onSubmit={handleEmailSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    autoComplete="email"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </Field>
                {(error || callbackError) && (
                  <FieldError>{error ?? callbackError}</FieldError>
                )}
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  Send code
                </Button>
              </FieldGroup>
            </form>
            <FieldSeparator>or</FieldSeparator>
            <Field>
              <Button
                disabled={!googleEnabled || isSubmitting}
                onClick={handleGoogleSignIn}
                type="button"
                variant="outline"
              >
                Continue with Google
              </Button>
              {!googleEnabled && (
                <FieldDescription>
                  Google sign-in is not configured in this environment.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle aria-level={1} role="heading">
          Enter your code
        </CardTitle>
        <CardDescription>
          We sent a 6-digit code to {email}. It expires in 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleOtpSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="otp">Code</FieldLabel>
              <Input
                id="otp"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, ""))
                }
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Verify and sign in
            </Button>
            <Button
              disabled={cooldownSeconds > 0 || isSubmitting}
              onClick={requestCode}
              type="button"
              variant="ghost"
            >
              {cooldownSeconds > 0
                ? `Resend code in ${cooldownSeconds}s`
                : "Resend code"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
