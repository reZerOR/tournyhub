/**
 * Normalizes cloud provider connection strings for node-postgres.
 *
 * Hosted Supabase databases require SSL. Node's TLS validator rejects
 * Supabase pooler certificate chains with SELF_SIGNED_CERT_IN_CHAIN when
 * `sslmode=require` is parsed as verify-full. Using `sslmode=no-verify` ensures
 * transport encryption remains active while preventing certificate verification
 * crashes in serverless runtimes.
 */
export function normalizeConnectionString(rawUrl: string): string {
  if (
    rawUrl.includes("pooler.supabase.com") ||
    rawUrl.includes("supabase.co")
  ) {
    if (!rawUrl.includes("sslmode=")) {
      return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}sslmode=no-verify`;
    }
    return rawUrl
      .replace("sslmode=require", "sslmode=no-verify")
      .replace("sslmode=verify-full", "sslmode=no-verify")
      .replace("sslmode=verify-ca", "sslmode=no-verify");
  }
  return rawUrl;
}
