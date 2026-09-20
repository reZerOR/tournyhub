"use client";

import { type FormEvent, useState } from "react";

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

function RepresentativeSummary({
  view,
}: {
  view: SerializedRepresentativeView;
}) {
  if (!view.user) return null;
  return (
    <p className="text-sm">
      {view.user.name || view.user.email}
      {view.user.name ? ` (${view.user.email})` : ""} —{" "}
      {view.team.representativeType === "player"
        ? `Player Representative${view.playerEntry ? `: ${view.playerEntry.displayName}` : ""}`
        : "Outside Representative"}
    </p>
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
    availableEntries[0]?.id ?? "",
  );
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);

  function applyResult(
    result:
      | { representatives: SerializedRepresentativeView[]; status: "saved" }
      | { message: string; status: "error" },
    successNotice: string,
  ) {
    if (result.status === "saved") {
      onSaved(result.representatives);
      setEmail("");
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
      playerEntryId,
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
    <li className="flex flex-col gap-3 border-b py-4 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{view.team.name ?? "Unnamed Team"}</span>
        {view.user && (
          <Button
            disabled={pending}
            onClick={remove}
            size="sm"
            type="button"
            variant="outline"
          >
            Remove representative
          </Button>
        )}
      </div>

      {view.user ? (
        <RepresentativeSummary view={view} />
      ) : (
        <p className="text-sm text-muted-foreground">No representative yet.</p>
      )}

      {view.invitation && (
        <p className="text-sm text-muted-foreground">
          Pending invitation to {view.invitation.email} (expires{" "}
          {new Date(view.invitation.expiresAt).toLocaleDateString()}).
        </p>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={assign}>
        <Field className="max-w-xs">
          <FieldLabel htmlFor={`entry-${view.team.id}`}>
            Player Entry
          </FieldLabel>
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            id={`entry-${view.team.id}`}
            onChange={(event) => setPlayerEntryId(event.target.value)}
            value={playerEntryId}
          >
            {availableEntries.length === 0 && (
              <option value="">No eligible Player Entries</option>
            )}
            {availableEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field className="max-w-xs">
          <FieldLabel htmlFor={`email-${view.team.id}`}>
            Representative email
          </FieldLabel>
          <Input
            id={`email-${view.team.id}`}
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            value={email}
          />
        </Field>
        <Button
          disabled={pending || playerEntryId === "" || email.trim() === ""}
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
      </form>

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
  // A Player Entry already assigned to any Team leaves the choice lists. This
  // reads the saved representative state, so it updates after every assignment.
  const usedEntryIds = new Set(
    representatives.flatMap((view) =>
      view.playerEntry ? [view.playerEntry.id] : [],
    ),
  );
  const availableEntries = entries.filter(
    (entry) => !usedEntryIds.has(entry.id),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Representatives
        </CardTitle>
        <CardDescription>
          Give each Team one representative: a Player Representative from the
          Player Entries, or an invited Outside Representative.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create Teams before assigning representatives.
          </p>
        ) : (
          <ul className="flex flex-col">
            {teams.map((team) => {
              const view = byTeam.get(team.id);
              if (!view) return null;
              return (
                <TeamRepresentative
                  auctionId={auctionId}
                  availableEntries={availableEntries}
                  key={team.id}
                  onSaved={setRepresentatives}
                  view={view}
                />
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
