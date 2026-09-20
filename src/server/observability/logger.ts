/**
 * Structured, redacted operational logging.
 *
 * The beta has no external error tracker, so platform logs are the only
 * operational record. Every entry is one JSON line, which Vercel and Supabase
 * both capture, and every entry passes through `redact` first so a sensitive
 * value cannot be logged by accident.
 */
export type LogLevel = "error" | "info" | "warn";

/**
 * Keys whose value is never logged. The list names the data the security
 * policy protects: credentials, authentication artifacts, private contact
 * data, and raw or full Auction content.
 */
export const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|credential|secret|password|otp|token|phone|snapshot|payload|body|raw|import|email)/i;

export const REDACTED = "[redacted]";

/** One log field value, after redaction. */
export type LogValue =
  boolean | null | number | string | LogValue[] | { [key: string]: LogValue };

function redactValue(value: unknown, key: string): LogValue {
  if (SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, key));
  }
  if (typeof value === "object") {
    return redactFields(value as Record<string, unknown>);
  }
  return String(value);
}

/** Removes every sensitive field, at any depth, from a log object. */
export function redactFields(
  fields: Record<string, unknown>,
): Record<string, LogValue> {
  const result: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = redactValue(value, key);
  }
  return result;
}

export interface LogEntry {
  correlationId?: string;
  errorCode?: string;
  latencyMs?: number;
  level: LogLevel;
  message: string;
  time: string;
  [key: string]: unknown;
}

/** Builds the redacted entry that would be written for one log call. */
export function buildLogEntry(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): LogEntry {
  return {
    ...redactFields(fields),
    level,
    message,
    time: now.toISOString(),
  };
}

/** Writes one structured log line. */
export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const entry = buildLogEntry(level, message, fields);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/**
 * The stable error code recorded for a failure. The message itself is never
 * logged, because a provider error can quote a connection string or a value.
 */
export function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code)) {
      return code;
    }
  }
  return "unexpected_error";
}
