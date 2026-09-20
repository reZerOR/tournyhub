"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { inspectAuctionAction } from "@/features/administration/administration-actions";
import type { ModerationSummary } from "@/server/auction-query/administration";

/**
 * Reason-gated inspection. The reason is recorded before the read-only summary
 * is returned, and the summary names counts and lifecycle only: no Roster,
 * price, phone number, or credential, and no control that could change an
 * outcome.
 */
export function ModerationInspect({ auctionId }: { auctionId: string }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [summary, setSummary] = useState<ModerationSummary | null>(null);

  async function inspect() {
    setPending(true);
    setMessage(null);
    const result = await inspectAuctionAction({ auctionId, reason });
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    setSummary(result.summary);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Recorded inspection
        </CardTitle>
        <CardDescription>
          Enter a reason before inspecting. The reason is stored as an immutable
          moderation record, and a Platform Administrator can never edit this
          Auction&apos;s Rules, Teams, Bids, Sales, or Results.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field className="max-w-md">
          <FieldLabel htmlFor="moderation-reason">Moderation reason</FieldLabel>
          <Input
            id="moderation-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </Field>

        <div>
          <Button
            disabled={pending || reason.trim() === ""}
            onClick={inspect}
            type="button"
          >
            {pending && <Spinner data-icon="inline-start" />}
            Record reason and inspect
          </Button>
        </div>

        {message && <FieldError>{message}</FieldError>}

        {summary && (
          <div
            className="flex flex-col gap-3"
            role="region"
            aria-label="Inspection summary"
          >
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Title</dt>
                <dd>{summary.auction.title || "Untitled Auction"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{summary.auction.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Revision</dt>
                <dd className="tabular-nums">{summary.auction.revision}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Teams</dt>
                <dd className="tabular-nums">{summary.counts.teams}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Players</dt>
                <dd className="tabular-nums">{summary.counts.players}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Bids</dt>
                <dd className="tabular-nums">{summary.counts.bids}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sales</dt>
                <dd className="tabular-nums">{summary.counts.sales}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Audit Entries</dt>
                <dd className="tabular-nums">{summary.counts.audits}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hidden</dt>
                <dd>{summary.auction.hidden ? "Yes" : "No"}</dd>
              </div>
            </dl>

            {summary.accessHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Moderation history</h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {summary.accessHistory.map((entry, index) => (
                    <li key={index}>
                      {entry.action} — {entry.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
