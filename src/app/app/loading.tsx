import { Spinner } from "@/components/ui/spinner";

/**
 * The authenticated loading state. It names what is happening and is announced
 * politely, so a User waiting on a slow request knows the page is still coming.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 py-16 text-center">
      <Spinner />
      <p
        aria-live="polite"
        className="text-sm text-muted-foreground"
        role="status"
      >
        Loading…
      </p>
    </div>
  );
}
