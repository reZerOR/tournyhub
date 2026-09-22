"use client";

import { CircleCheck, Play, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { startAuctionAction } from "@/features/auctions/setup/readiness-actions";
import { cn } from "cn";

/**
 * The launch lever for the Setup console. Mounted prominently in the Setup header
 * so the Organizer always knows the auction's launch readiness and can initiate
 * the auction without hunting for an action at the bottom of the page.
 */
export function GateBar({
  auctionId,
  openRequirements,
  warnings,
  ready,
}: {
  auctionId: string;
  openRequirements: number;
  warnings: number;
  ready: boolean;
}) {
  const readoutId = useId();
  const pathname = usePathname();
  const router = useRouter();
  const isFirstStation = useRef(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<null | {
    issues: string[];
    message: string;
  }>(null);

  /*
    The Setup shell is a shared layout, so it stays mounted while the Organizer
    moves between stations and Next serves a route it has already visited from
    its cache. Re-reading the route on every move keeps the readiness status honest.
  */
  useEffect(() => {
    if (isFirstStation.current) {
      isFirstStation.current = false;
      return;
    }
    router.refresh();
  }, [pathname, router]);

  async function start() {
    setPending(true);
    setFailure(null);
    const result = await startAuctionAction(auctionId);
    setPending(false);
    if (result.status === "error") {
      setFailure({ issues: result.issues, message: result.message });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ready ? (
        <span
          className="hidden items-center gap-1.5 rounded-md border border-roster/30 bg-roster/10 px-2.5 py-1 text-xs font-medium text-roster sm:inline-flex"
          id={readoutId}
        >
          <CircleCheck aria-hidden className="size-3.5" />
          Ready to start
        </span>
      ) : (
        <Link
          className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
          href={`/app/auctions/${auctionId}/setup/readiness`}
          id={readoutId}
          title="View readiness checklist"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          <span>
            {openRequirements} open
            {warnings > 0 ? ` · ${warnings} warn` : ""}
          </span>
        </Link>
      )}

      <Button
        aria-describedby={readoutId}
        className={cn(
          "gap-1.5 shadow-xs font-semibold",
          ready
            ? "border-neon/40"
            : "border-border/80 text-muted-foreground hover:text-foreground",
        )}
        disabled={pending}
        onClick={start}
        size="sm"
        type="button"
        variant={ready ? "neon" : "outline"}
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Play
            aria-hidden
            className={cn("size-3.5", ready && "fill-current")}
          />
        )}
        Start Auction
      </Button>

      {/* Readiness Issues Modal (when starting fails due to open requirements) */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setFailure(null);
        }}
        open={failure !== null}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <TriangleAlert className="size-5" />
              Auction Not Ready
            </DialogTitle>
            <DialogDescription>
              {failure?.message ||
                "Resolve all open requirements before starting the auction."}
            </DialogDescription>
          </DialogHeader>

          {failure?.issues && failure.issues.length > 0 && (
            <div className="my-2 rounded-lg border border-border/80 bg-muted/40 p-3">
              <ul className="flex flex-col gap-2 text-sm">
                {failure.issues.map((issue, index) => (
                  <li
                    className="flex items-start gap-2 text-foreground/90"
                    key={index}
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter className="mt-4 sm:justify-between">
            <Link
              className={buttonVariants({ variant: "default" })}
              href={`/app/auctions/${auctionId}/setup/readiness`}
              onClick={() => setFailure(null)}
            >
              Go to Readiness Checklist
            </Link>
            <Button
              onClick={() => setFailure(null)}
              type="button"
              variant="outline"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
