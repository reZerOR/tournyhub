"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { restoreAuctionAction } from "@/features/auctions/lifecycle/lifecycle-actions";

/** Restores an Archived Auction while its seven-day window is open. */
export function RestoreAuctionButton({
  auctionId,
  label,
}: {
  auctionId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);

  async function restore() {
    setPending(true);
    setMessage(null);
    const result = await restoreAuctionAction(auctionId);
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        disabled={pending}
        onClick={restore}
        size="sm"
        type="button"
        variant="outline"
      >
        {pending && <Spinner data-icon="inline-start" />}
        Restore
      </Button>
      {message && (
        <span className="text-sm text-destructive" role="alert">
          {message}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
