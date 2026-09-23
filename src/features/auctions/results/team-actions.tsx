"use client";

import { useState } from "react";
import { Check, Copy, FileDown, Sheet } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

export function TeamActions({
  auctionId,
  teamId,
  teamName,
  rosterText,
  canExportContacts,
}: {
  auctionId: string;
  teamId: string;
  teamName: string;
  rosterText: string;
  canExportContacts: boolean;
}) {
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");
  const base = `/app/auctions/${auctionId}/results/export`;
  const query = `?teamId=${encodeURIComponent(teamId)}`;

  async function copyRoster() {
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(rosterText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        className="flex flex-wrap justify-center gap-2"
        role="group"
        aria-label={`${teamName} roster actions`}
      >
        <Button
          variant="outline"
          onClick={copyRoster}
          disabled={copyState === "copying"}
        >
          {copyState === "copied" ? (
            <Check data-icon="inline-start" />
          ) : (
            <Copy data-icon="inline-start" />
          )}
          {copyState === "copied" ? "Copied" : "Copy roster"}
        </Button>
        <a
          className={buttonVariants({ variant: "outline" })}
          href={`${base}/pdf${query}`}
          download
        >
          <FileDown data-icon="inline-start" /> PDF
        </a>
        {canExportContacts && (
          <>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={`${base}/xlsx${query}`}
              download
            >
              <Sheet data-icon="inline-start" /> Excel
            </a>
            <a
              className={buttonVariants({ variant: "ghost" })}
              href={`${base}/csv${query}`}
              download
            >
              CSV
            </a>
          </>
        )}
      </div>
      <span className="sr-only" role="status">
        {copyState === "copied" ? `${teamName} roster copied.` : ""}
      </span>
      {copyState === "failed" && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-muted-foreground">
            Clipboard access was blocked. Select and copy the roster below.
          </p>
          <textarea
            aria-label={`${teamName} roster text`}
            readOnly
            value={rosterText}
            onFocus={(event) => event.currentTarget.select()}
            rows={6}
            className="w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
      )}
    </div>
  );
}
