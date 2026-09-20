"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ARCHIVE_RETENTION_DAYS } from "@/domain/lifecycle";
import { archiveAuctionAction } from "@/features/auctions/lifecycle/lifecycle-actions";

/**
 * Archives an Auction from where the Organizer already is. Archiving hides it
 * from the normal lists and starts the seven-day recovery window.
 */
export function ArchiveAuctionButton({ auctionId }: { auctionId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);

  async function archive() {
    setPending(true);
    setMessage(null);
    const result = await archiveAuctionAction(auctionId);
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Archive Auction
        </CardTitle>
        <CardDescription>
          Hide this Auction from your lists. It stays recoverable for{" "}
          {ARCHIVE_RETENTION_DAYS} days, then it is permanently deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button
            disabled={pending}
            onClick={archive}
            type="button"
            variant="secondary"
          >
            {pending && <Spinner data-icon="inline-start" />}
            Archive Auction
          </Button>
        </div>
        {message && <FieldError>{message}</FieldError>}
      </CardContent>
    </Card>
  );
}
