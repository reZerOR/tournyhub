import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIX = "/app";
const SIGN_IN_PATH = "/sign-in";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(
    getSessionCookie(request, { cookiePrefix: "tournyhub" }),
  );

  if (pathname.startsWith(PROTECTED_PREFIX) && !hasSessionCookie) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
  }

  if (pathname === SIGN_IN_PATH && hasSessionCookie) {
    return NextResponse.redirect(new URL(PROTECTED_PREFIX, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/sign-in"],
};
