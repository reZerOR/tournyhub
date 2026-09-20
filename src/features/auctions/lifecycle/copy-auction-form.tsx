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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { defaultCopyTitle } from "@/domain/lifecycle";
import type { CopySourceOption } from "@/server/auction-query/lifecycle";
import {
  copyAuctionAction,
  loadCopySourceAction,
} from "@/features/auctions/lifecycle/lifecycle-actions";

interface SourcePlayer {
  displayName: string;
  hasStartingPriceOverride: boolean;
  hasTier: boolean;
  id: string;
}

/**
 * Copies an earlier Auction into a new Draft. The Organizer selects exactly
 * which Player Entries travel and whether Tier and Starting Price data comes
 * across; Teams, representatives, and history never do.
 */
export function CopyAuctionForm({ sources }: { sources: CopySourceOption[] }) {
  const router = useRouter();
  const [sourceAuctionId, setSourceAuctionId] = useState("");
  const [title, setTitle] = useState("");
  const [keepTierAndPrice, setKeepTierAndPrice] = useState(false);
  const [players, setPlayers] = useState<SourcePlayer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);

  async function chooseSource(id: string) {
    setSourceAuctionId(id);
    setSelectedIds([]);
    setPlayers([]);
    setMessage(null);
    if (id === "") return;

    const source = sources.find((candidate) => candidate.id === id);
    if (source) setTitle(defaultCopyTitle(source.title));

    setLoading(true);
    const detail = await loadCopySourceAction(id);
    setLoading(false);
    if (!detail) {
      setMessage("That Auction is no longer available to copy.");
      return;
    }
    setPlayers(detail.players);
    setSelectedIds(detail.players.map((player) => player.id));
  }

  function toggle(playerId: string) {
    setSelectedIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    );
  }

  async function submit() {
    setPending(true);
    setMessage(null);
    const result = await copyAuctionAction({
      keepTierAndPrice,
      playerEntryIds: selectedIds,
      sourceAuctionId,
      title,
    });
    setPending(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    router.push(`/app/auctions/${result.auctionId}/setup/basics`);
  }

  if (sources.length === 0) return null;

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Copy an earlier Auction
        </CardTitle>
        <CardDescription>
          Reuse Rules, Custom Player Fields, and selected Player Entries. Teams,
          representatives, invitations, Bids, Sales, and Results never copy.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="copy-source">Source Auction</FieldLabel>
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            id="copy-source"
            onChange={(event) => void chooseSource(event.target.value)}
            value={sourceAuctionId}
          >
            <option value="">Choose an Auction</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.title || "Untitled Auction"} ({source.playerCount}{" "}
                Players)
              </option>
            ))}
          </select>
        </Field>

        {sourceAuctionId !== "" && (
          <>
            <Field data-invalid={title.trim() === ""}>
              <FieldLabel htmlFor="copy-title">New Auction title</FieldLabel>
              <Input
                aria-invalid={title.trim() === ""}
                id="copy-title"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">
                Player Entries to copy
              </legend>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : players.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This Auction has no Player Entries.
                </p>
              ) : (
                <>
                  <div className="flex gap-3">
                    <Button
                      onClick={() =>
                        setSelectedIds(players.map((player) => player.id))
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Select all
                    </Button>
                    <Button
                      onClick={() => setSelectedIds([])}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Select none
                    </Button>
                  </div>
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {players.map((player) => (
                      <li key={player.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            checked={selectedIds.includes(player.id)}
                            onChange={() => toggle(player.id)}
                            type="checkbox"
                          />
                          <span>{player.displayName}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </fieldset>

            <label className="flex items-center gap-2 text-sm">
              <input
                checked={keepTierAndPrice}
                onChange={(event) => setKeepTierAndPrice(event.target.checked)}
                type="checkbox"
              />
              <span>Keep copied Tier assignments and Starting Prices</span>
            </label>

            <div>
              <Button
                disabled={pending || title.trim() === ""}
                onClick={submit}
                type="button"
              >
                {pending && <Spinner data-icon="inline-start" />}
                Copy into a new Draft
              </Button>
            </div>
          </>
        )}

        {message && <FieldError>{message}</FieldError>}
      </CardContent>
    </Card>
  );
}
