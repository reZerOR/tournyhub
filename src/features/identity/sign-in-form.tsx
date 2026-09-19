"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/features/identity/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function SignInForm() {
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
      if (cooldownInterval.current) {
        clearInterval(cooldownInterval.current);
      }
    };
  }, []);

  function startCooldown() {
    setCooldownSeconds(OTP_RESEND_COOLDOWN_SECONDS);
    if (cooldownInterval.current) {
      clearInterval(cooldownInterval.current);
    }
    cooldownInterval.current = setInterval(() => {
      setCooldownSeconds((remaining) => {
        if (remaining <= 1) {
          if (cooldownInterval.current) {
            clearInterval(cooldownInterval.current);
          }
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

    router.push("/app");
    router.refresh();
  }

  if (step === "email") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            We&apos;ll email you a one-time code. No password needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleEmailSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                autoComplete="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Sending…" : "Send code"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Enter your code</CardTitle>
        <CardDescription>
          We sent a 6-digit code to {email}. It expires in 10 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleOtpSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp">Code</Label>
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
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Verifying…" : "Verify and sign in"}
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
        </form>
      </CardContent>
    </Card>
  );
}
