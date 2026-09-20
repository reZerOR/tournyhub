"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminAuctionRow } from "@/server/auction-query/administration";
import {
  hideAuctionAction,
  unhideAuctionAction,
} from "@/features/administration/administration-actions";

/**
 * One Auction's moderation controls. Hiding keeps every record and simply makes
 * the Auction unavailable; an inspection opens a recorded, read-only summary.
 */
export function AdminAuctionRowView({ auction }: { auction: AdminAuctionRow }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);

  async function run(
    action: () => Promise<{ message?: string; status: string }>,
    done: string,
  ) {
    setPending(true);
    setMessage(null);
    setNotice(null);
    const result = await action();
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message ?? "The action failed.");
      return;
    }
    setNotice(done);
  }

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {auction.title || "Untitled Auction"} ·{" "}
          {auction.organizerEmail ?? "Unknown Organizer"}
        </span>
        <span className="flex items-center gap-2">
          <Badge className="capitalize" variant="secondary">
            {auction.status}
          </Badge>
          {auction.hidden && <Badge variant="destructive">Hidden</Badge>}
        </span>
      </div>

      <Field className="max-w-md">
        <FieldLabel htmlFor={`reason-${auction.id}`}>Reason</FieldLabel>
        <Input
          id={`reason-${auction.id}`}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Link
          className="text-sm underline"
          href={`/app/admin/auctions/${auction.id}`}
        >
          Inspect with a reason
        </Link>
        {auction.hidden ? (
          <Button
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              run(
                () => unhideAuctionAction({ auctionId: auction.id, reason }),
                "Auction unhidden.",
              )
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            Unhide Auction
          </Button>
        ) : (
          <Button
            disabled={pending || reason.trim() === ""}
            onClick={() =>
              run(
                () => hideAuctionAction({ auctionId: auction.id, reason }),
                "Auction hidden.",
              )
            }
            size="sm"
            type="button"
            variant="destructive"
          >
            Hide Auction
          </Button>
        )}
      </div>

      {message && <FieldError>{message}</FieldError>}
      {notice && (
        <p aria-live="polite" className="text-sm" role="status">
          {notice}
        </p>
      )}
    </li>
  );
}
