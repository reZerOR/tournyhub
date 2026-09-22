"use client";

import { type FormEvent, useState } from "react";
import Image from "next/image";
import { Clock, Mail, Pencil, Trash2, UserCheck, X } from "lucide-react";
import { cn } from "cn";

import { StationLamp, StationPlate } from "@/components/arena";
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
import {
  assignPlayerRepresentativeAction,
  inviteRepresentativeAction,
  removeRepresentativeAction,
} from "@/features/auctions/setup/representative-actions";
import type {
  SerializedRepresentativeView,
  SerializedTeam,
} from "@/features/auctions/setup/serialize-team";
import type { SerializedPlayerEntry } from "@/features/auctions/setup/serialize-player";

function TeamState({ view }: { view: SerializedRepresentativeView }) {
  const label = view.user
    ? "assigned"
    : view.invitation
      ? "invited"
      : "unassigned";
  const state = view.user ? "clear" : view.invitation ? "pending" : "blocked";

  return (
    <span className="flex items-center gap-2">
      <StationLamp state={state} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function TeamRepresentative({
  auctionId,
  availableEntries,
  onSaved,
  view,
}: {
  auctionId: string;
  availableEntries: SerializedPlayerEntry[];
  onSaved: (representatives: SerializedRepresentativeView[]) => void;
  view: SerializedRepresentativeView;
}) {
  const [playerEntryId, setPlayerEntryId] = useState(
    view.playerEntry?.id ?? availableEntries[0]?.id ?? "",
  );
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);
  const [isEditing, setIsEditing] = useState(false);

  const hasRepresentation = Boolean(view.user || view.invitation);

  const savedPlayerEntryId = view.playerEntry?.id;
  const currentEntryId =
    availableEntries.some((e) => e.id === playerEntryId)
      ? playerEntryId
      : (savedPlayerEntryId &&
          availableEntries.some((e) => e.id === savedPlayerEntryId)
        ? savedPlayerEntryId
        : (availableEntries[0]?.id ?? ""));

  const entryItems = availableEntries.map((entry) => ({
    label: entry.displayName,
    value: entry.id,
  }));

  function startEditing() {
    setIsEditing(true);
    setErrorMessage(null);
    setEmail(view.user?.email ?? view.invitation?.email ?? "");
    if (view.playerEntry) {
      setPlayerEntryId(view.playerEntry.id);
    } else if (availableEntries.length > 0) {
      setPlayerEntryId(availableEntries[0].id);
    }
  }

  function applyResult(
    result:
      | { representatives: SerializedRepresentativeView[]; status: "saved" }
      | { message: string; status: "error" },
    successNotice: string,
  ) {
    if (result.status === "saved") {
      onSaved(result.representatives);
      setEmail("");
      setIsEditing(false);
      setErrorMessage(null);
      setNotice(successNotice);
    } else {
      setNotice(null);
      setErrorMessage(result.message);
    }
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await assignPlayerRepresentativeAction(auctionId, {
      email,
      playerEntryId: currentEntryId,
      teamId: view.team.id,
    });
    setPending(false);
    applyResult(result, "Player Representative assigned.");
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await inviteRepresentativeAction(auctionId, {
      email,
      teamId: view.team.id,
    });
    setPending(false);
    if (result.status === "invited") {
      setIsEditing(false);
      setErrorMessage(null);
      setNotice(`Invitation sent to ${result.email}.`);
    } else {
      setNotice(null);
      setErrorMessage(result.message);
    }
  }

  async function remove() {
    setPending(true);
    const result = await removeRepresentativeAction(auctionId, view.team.id);
    setPending(false);
    applyResult(result, "Representative removed.");
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-3 py-4 first:pt-0 last:pb-0 transition-colors",
        view.team.color && "border-l-4 pl-3.5",
      )}
      style={
        view.team.color
          ? {
              borderLeftColor: view.team.color,
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          {view.team.logoHref ? (
            <div className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border/80 bg-card">
              <Image
                alt={`${view.team.name ?? "Team"} logo`}
                className="size-full object-contain p-0.5"
                height={32}
                src={view.team.logoHref}
                width={32}
              />
            </div>
          ) : (
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold shadow-2xs"
              style={
                view.team.color
                  ? {
                      backgroundColor: `color-mix(in oklab, ${view.team.color} 20%, transparent)`,
                      borderColor: `color-mix(in oklab, ${view.team.color} 60%, transparent)`,
                      color: view.team.color,
                    }
                  : {
                      backgroundColor: "var(--muted)",
                      borderColor: "var(--border)",
                    }
              }
            >
              {(view.team.name ?? "T").charAt(0).toUpperCase()}
            </span>
          )}

          <span className="font-medium text-foreground">
            {view.team.name ?? "Unnamed Team"}
          </span>

          <TeamState view={view} />
        </div>
      </div>

      {/* Representation Card with Visual Hierarchy */}
      {view.user && !isEditing && (() => {
        const displayName =
          view.team.representativeType === "player" && view.playerEntry
            ? view.playerEntry.displayName
            : (view.user.name || view.user.email);
        const showEmailSubline =
          Boolean(view.user.email) &&
          displayName.trim().toLowerCase() !==
            view.user.email.trim().toLowerCase();

        return (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/70 bg-card/60 p-3.5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserCheck className="size-4.5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {displayName}
                  </span>
                  <Badge
                    variant={
                      view.team.representativeType === "player"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {view.team.representativeType === "player"
                      ? "Player Representative"
                      : "Outside Representative"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {showEmailSubline && (
                    <span className="flex items-center gap-1">
                      <Mail className="size-3 text-muted-foreground/70" />
                      {view.user.email}
                    </span>
                  )}
                  {view.team.representativeType === "player" &&
                    view.user.name &&
                    view.user.name !== displayName && (
                      <span className="text-muted-foreground/80">
                        Account: {view.user.name}
                      </span>
                    )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                disabled={pending}
                onClick={startEditing}
                size="sm"
                type="button"
                variant="outline"
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button
                disabled={pending}
                onClick={remove}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Pending Invitation Card */}
      {view.invitation && !view.user && !isEditing && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border/70 bg-card/60 p-3.5 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Clock className="size-4.5" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground text-sm">
                  {view.invitation.email}
                </span>
                <Badge variant="warning">Invitation Pending</Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                Invitation sent · expires{" "}
                {new Date(view.invitation.expiresAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              disabled={pending}
              onClick={startEditing}
              size="sm"
              type="button"
              variant="outline"
            >
              <Pencil className="size-3.5" />
              Change
            </Button>
            <Button
              disabled={pending}
              onClick={remove}
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash2 className="size-3.5" />
              Cancel invitation
            </Button>
          </div>
        </div>
      )}

      {/* Empty State / Assignment Form */}
      {(!hasRepresentation || isEditing) && (
        <form
          className={cn(
            "flex flex-col gap-3 rounded-lg border border-border/70 p-3.5 transition-colors",
            isEditing ? "bg-card/80 shadow-xs" : "bg-muted/20",
          )}
          onSubmit={assign}
        >
          {isEditing && (
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-xs font-semibold text-foreground">
                Edit Representative for {view.team.name ?? "Team"}
              </span>
              <Button
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setIsEditing(false);
                  setErrorMessage(null);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Field className="max-w-xs">
              <FieldLabel htmlFor={`entry-${view.team.id}`}>
                Player Entry
              </FieldLabel>
              <Select
                disabled={availableEntries.length === 0}
                items={entryItems}
                onValueChange={(val) => setPlayerEntryId(val ?? "")}
                value={currentEntryId}
              >
                <SelectTrigger className="w-full" id={`entry-${view.team.id}`}>
                  <SelectValue
                    placeholder={
                      availableEntries.length === 0
                        ? "No eligible Player Entries"
                        : "Select a Player Entry"
                    }
                  >
                    {(val: string | null) =>
                      val
                        ? (availableEntries.find((e) => e.id === val)?.displayName ??
                          val)
                        : undefined
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableEntries.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.displayName}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="max-w-xs">
              <FieldLabel htmlFor={`email-${view.team.id}`}>
                Representative email
              </FieldLabel>
              <Input
                id={`email-${view.team.id}`}
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="representative@example.com"
                value={email}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={
                  pending || currentEntryId === "" || email.trim() === ""
                }
                type="submit"
              >
                Assign Player Representative
              </Button>
              <Button
                disabled={pending || email.trim() === ""}
                onClick={invite}
                type="button"
                variant="outline"
              >
                Invite Outside Representative
              </Button>
            </div>
          </div>
        </form>
      )}

      {errorMessage && <FieldError>{errorMessage}</FieldError>}
      {notice && (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </li>
  );
}

export function RepresentativesEditor({
  auctionId,
  entries,
  representatives: initialRepresentatives,
  teams,
}: {
  auctionId: string;
  entries: SerializedPlayerEntry[];
  representatives: SerializedRepresentativeView[];
  teams: SerializedTeam[];
}) {
  const [representatives, setRepresentatives] = useState(
    initialRepresentatives,
  );

  const byTeam = new Map(representatives.map((view) => [view.team.id, view]));
  const representedCount = representatives.filter((view) => view.user).length;

  return (
    <StationPlate
      label="Representatives"
      stat={
        <>
          {representedCount} of {teams.length} represented
        </>
      }
    >
      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create Teams before assigning representatives.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60">
          {teams.map((team) => {
            const view = byTeam.get(team.id);
            if (!view) return null;

            // Available entries for THIS team: all entries not used by OTHER teams.
            // This ensures this team's currently assigned player (if any) is available and pre-selected.
            const otherUsedEntryIds = new Set(
              representatives.flatMap((v) =>
                v.team.id !== team.id && v.playerEntry
                  ? [v.playerEntry.id]
                  : [],
              ),
            );
            const teamAvailableEntries = entries.filter(
              (entry) => !otherUsedEntryIds.has(entry.id),
            );

            return (
              <TeamRepresentative
                auctionId={auctionId}
                availableEntries={teamAvailableEntries}
                key={team.id}
                onSaved={setRepresentatives}
                view={view}
              />
            );
          })}
        </ul>
      )}
    </StationPlate>
  );
}
