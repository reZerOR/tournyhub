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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/features/identity/auth-client";
import { GoogleMark } from "@/features/identity/google-mark";
import { OTP_RESEND_COOLDOWN_SECONDS } from "@/server/auth/otp-request-log";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, ArrowRight, Clock, Lock, Mail } from "lucide-react";
import Image from "next/image";

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

  function useDifferentEmail() {
    setError(null);
    setOtp("");
    setStep("email");
  }

  if (step === "email") {
    const callbackError = oauthErrorMessage(oauthError);

    return (
      <Card className="w-full max-w-md border-white/10 bg-card/85 shadow-2xl backdrop-blur-md">
        <CardHeader className="items-center text-center">
          <Image
            src="/tournyhub_icon.svg"
            alt=""
            width={48}
            height={48}
            className="mx-auto size-12"
          />
          <CardTitle aria-level={1} role="heading" className="text-2xl">
            Sign in to TournyHub
          </CardTitle>
          <CardDescription>
            Use a one-time code or continue with Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <form onSubmit={handleEmailSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email address</FieldLabel>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      autoComplete="email"
                      required
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </Field>
                {(error || callbackError) && (
                  <FieldError>{error ?? callbackError}</FieldError>
                )}
                <Button
                  disabled={isSubmitting}
                  type="submit"
                  size="lg"
                  className="w-full"
                >
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  Send code
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </FieldGroup>
            </form>
            <div
              data-slot="field-separator"
              className="relative flex items-center gap-4 text-xs text-white/60 uppercase"
            >
              <span aria-hidden className="h-px flex-1 bg-white/15" />
              Or
              <span aria-hidden className="h-px flex-1 bg-white/15" />
            </div>
            <Field>
              <Button
                disabled={!googleEnabled || isSubmitting}
                onClick={handleGoogleSignIn}
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
              >
                <GoogleMark data-icon="inline-start" />
                Continue with Google
              </Button>
              {!googleEnabled && (
                <FieldDescription>
                  Google sign-in is not configured in this environment.
                </FieldDescription>
              )}
            </Field>
            <div className="flex flex-col items-center gap-1 pt-2 text-center">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Lock className="size-4" />
                Secure passwordless sign-in
              </p>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-white/10 bg-card/85 shadow-2xl backdrop-blur-md">
      <CardHeader className="items-center text-center">
        <Image
          src="/tournyhub_icon.svg"
          alt=""
          width={48}
          height={48}
          className="mx-auto size-12"
        />
        <CardTitle aria-level={1} role="heading" className="text-2xl">
          Enter verification code
        </CardTitle>
        <CardDescription>
          We sent a 6-digit code to {email}. It expires in 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleOtpSubmit}>
          <FieldGroup>
            <Field>
              <InputOTP
                id="otp"
                aria-label="Code"
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                required
                value={otp}
                onChange={(value) => setOtp(value.replace(/\D/g, ""))}
                containerClassName="justify-center"
              >
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot
                    index={0}
                    className="size-12 rounded-lg border text-lg"
                  />
                  <InputOTPSlot
                    index={1}
                    className="size-12 rounded-lg border text-lg"
                  />
                  <InputOTPSlot
                    index={2}
                    className="size-12 rounded-lg border text-lg"
                  />
                  <InputOTPSlot
                    index={3}
                    className="size-12 rounded-lg border text-lg"
                  />
                  <InputOTPSlot
                    index={4}
                    className="size-12 rounded-lg border text-lg"
                  />
                  <InputOTPSlot
                    index={5}
                    className="size-12 rounded-lg border text-lg"
                  />
                </InputOTPGroup>
              </InputOTP>
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button
              disabled={isSubmitting}
              type="submit"
              size="lg"
              className="w-full"
            >
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Verify and sign in
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              disabled={cooldownSeconds > 0 || isSubmitting}
              onClick={requestCode}
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
            >
              <Clock data-icon="inline-start" />
              {cooldownSeconds > 0
                ? `Resend code in ${cooldownSeconds}s`
                : "Resend code"}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={useDifferentEmail}
              type="button"
              variant="ghost"
            >
              <ArrowLeft data-icon="inline-start" />
              Use a different email
            </Button>
            <div className="flex flex-col items-center gap-1 pt-2 text-center">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Lock className="size-4" />
                Secure passwordless sign-in
              </p>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
