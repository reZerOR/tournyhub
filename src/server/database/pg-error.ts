/**
 * True when PostgreSQL rejected a write because it violated a unique constraint.
 *
 * Pass `constraint` when the caller is interpreting the failure as a specific
 * business conflict, such as the beta's single-Live-Auction rule. Without it,
 * any unique violation would be blamed on that rule, which hides the real one.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code?: string }).code !== "23505"
  ) {
    return false;
  }
  if (constraint === undefined) return true;
  return (error as { constraint?: string }).constraint === constraint;
}
