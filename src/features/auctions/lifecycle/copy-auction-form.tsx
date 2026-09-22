"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck, ListChecks } from "lucide-react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const source = sources.find((candidate) => candidate.id === sourceAuctionId);

  return (
    <StationPlate
      footer={
        sourceAuctionId !== "" ? (
          <>
            <p className="font-mono text-xs text-muted-foreground">
              Teams and history never copy
            </p>
            <Button
              disabled={pending || title.trim() === ""}
              onClick={submit}
              type="button"
              variant="outline"
            >
              {pending && <Spinner data-icon="inline-start" />}
              Copy into a new Draft
            </Button>
          </>
        ) : null
      }
      label="Copy an earlier Auction"
      stat={
        <>
          <Badge variant="secondary">Rerun</Badge>
          {source ? (
            <span>
              {source.playerCount}{" "}
              {source.playerCount === 1 ? "Player" : "Players"} ·{" "}
              {source.rulesMode === "tiered" ? "Tiered" : "Simple"}
            </span>
          ) : null}
        </>
      }
      variant="section"
    >
      <StationGroup
        hint="Rules and Custom Player Fields always come across"
        label="Source"
      >
        <Field>
          <FieldLabel htmlFor="copy-source">Source Auction</FieldLabel>
          <Select
            items={sources.map((option) => ({
              label: `${option.title || "Untitled Auction"} (${option.playerCount} Players)`,
              value: option.id,
            }))}
            onValueChange={(val) => void chooseSource(val ?? "")}
            value={sourceAuctionId}
          >
            <SelectTrigger className="w-full sm:max-w-md" id="copy-source">
              <SelectValue placeholder="Choose an Auction">
                {(val: string | null) => {
                  const option = sources.find((s) => s.id === val);
                  return option
                    ? `${option.title || "Untitled Auction"} (${option.playerCount} Players)`
                    : (val ?? undefined);
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sources.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.title || "Untitled Auction"} ({option.playerCount}{" "}
                    Players)
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </StationGroup>

      {sourceAuctionId !== "" && (
        <>
          <StationGroup label="New Auction title">
            <Field data-invalid={title.trim() === ""}>
              <FieldLabel htmlFor="copy-title">New Auction title</FieldLabel>
              <Input
                aria-invalid={title.trim() === ""}
                id="copy-title"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Sunday Showdown copy"
                value={title}
              />
            </Field>
          </StationGroup>

          <StationGroup
            hint={
              loading
                ? undefined
                : `${selectedIds.length} of ${players.length} selected`
            }
            label="Player Entries to copy"
          >
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Reading Player Entries...
              </p>
            ) : players.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This Auction has no Player Entries.
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      setSelectedIds(players.map((player) => player.id))
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <CheckCheck aria-hidden className="size-4" />
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
                <ul className="flex max-h-64 flex-col divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/60">
                  {players.map((player) => (
                    <li key={player.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40 has-checked:bg-neon/5">
                        <input
                          checked={selectedIds.includes(player.id)}
                          className="size-4 shrink-0 cursor-pointer accent-neon"
                          onChange={() => toggle(player.id)}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {player.displayName}
                        </span>
                        {(player.hasTier ||
                          player.hasStartingPriceOverride) && (
                          <ListChecks
                            aria-label="Carries Tier or price data"
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </StationGroup>

          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
            <input
              checked={keepTierAndPrice}
              className="size-4 shrink-0 cursor-pointer accent-neon"
              onChange={(event) => setKeepTierAndPrice(event.target.checked)}
              type="checkbox"
            />
            <span>Keep copied Tier assignments and Starting Prices</span>
          </label>
        </>
      )}

      {message && <FieldError>{message}</FieldError>}
    </StationPlate>
  );
}
