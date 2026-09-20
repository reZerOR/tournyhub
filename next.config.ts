import type { NextConfig } from "next";

import { parseEnvironment } from "./src/config/environment";

const environment = parseEnvironment(process.env);

const isProduction = process.env.NODE_ENV === "production";

/**
 * The Content Security Policy. `unsafe-eval` is needed by the development
 * compiler's hot reload and is omitted from a production build. Frame
 * ancestors is denied outright, so the application can never be framed.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${environment.NEXT_PUBLIC_SUPABASE_URL}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=()",
  },
  // Only meaningful over HTTPS, which every non-local deployment uses.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Player import files are limited to 5 MB in
      // `src/domain/player-import.ts`; multipart encoding needs headroom above
      // that. Keep the two in step when either changes.
      bodySizeLimit: "6mb",
    },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: "/:path*",
      },
    ];
  },
};

export default nextConfig;
