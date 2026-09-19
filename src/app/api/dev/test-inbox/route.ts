import type { NextRequest } from "next/server";

import { readDevOtp } from "@/server/email/dev-inbox";
import type { OtpEmailMessage } from "@/server/email/types";

/**
 * Lets local development and browser tests read back the OTP a test
 * "sent" without a real inbox. Disabled outside development so it can
 * never leak a verification code in a deployed environment.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }

  const email = request.nextUrl.searchParams.get("email");
  const type = (request.nextUrl.searchParams.get("type") ??
    "sign-in") as OtpEmailMessage["type"];

  if (!email) {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  return Response.json({ otp: readDevOtp(email, type) });
}
