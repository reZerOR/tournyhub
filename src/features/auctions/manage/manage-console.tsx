"use client";

import { type FormEvent, useMemo, useState } from "react";

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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addPlayersAction,
  cancelAuctionAction,
  changeConstraintsAction,
  increaseBudgetAction,
  replaceRepresentativeAction,
  transferOwnershipAction,
  type ManageResult,
} from "@/features/auctions/manage/manage-actions";
import type {
  AuctionManagement,
  ManageTeamView,
} from "@/server/auction-query/manage";

function text(value: null | number | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function RepresentativeRow({
  auctionId,
  entries,
  onSaved,
  reason,
  team,
}: {
  auctionId: string;
  entries: { displayName: string; id: string }[];
  onSaved: (management: AuctionManagement | null) => void;
  reason: string;
  team: ManageTeamView;
}) {
  const [email, setEmail] = useState(
    team.representative?.email ?? team.invitation?.email ?? "",
  );
  const [playerEntryId, setPlayerEntryId] = useState(
    team.playerEntry?.id ?? "",
  );
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);

  const availableEntries = useMemo(() => {
    const list = [...entries];
    if (
      team.playerEntry &&
      !list.some((entry) => entry.id === team.playerEntry!.id)
    ) {
      list.unshift(team.playerEntry);
    }
    return list;
  }, [entries, team.playerEntry]);

  const selectItems = useMemo(
    () => [
      { label: "Outside Representative", value: "" },
      ...availableEntries.map((entry) => ({
        label: entry.displayName,
        value: entry.id,
      })),
    ],
    [availableEntries],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    const result = await replaceRepresentativeAction(auctionId, {
      email,
      playerEntryId: playerEntryId === "" ? null : playerEntryId,
      reason,
      teamId: team.id,
    });
    setPending(false);
    if (result.status === "saved") {
      onSaved(result.management);
    } else {
      setErrorMessage(result.message);
    }
  }

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-0">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{team.name ?? "Unnamed Team"}</span>
        <span className="text-sm text-muted-foreground">
          {team.representative
            ? `Representative: ${team.representative.name || team.representative.email}`
            : team.invitation
              ? `Invited: ${team.invitation.email}`
              : "No representative yet."}
          {team.playerEntry
            ? ` · Player Representative: ${team.playerEntry.displayName}`
            : ""}
        </span>
      </div>

      <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <Field className="max-w-xs">
          <FieldLabel htmlFor={`manage-entry-${team.id}`}>
            Player Entry (optional)
          </FieldLabel>
          <Select
            items={selectItems}
            onValueChange={(val) => setPlayerEntryId(val ?? "")}
            value={playerEntryId}
          >
            <SelectTrigger className="w-full" id={`manage-entry-${team.id}`}>
              <SelectValue placeholder="Outside Representative">
                {(val: string | null) => {
                  if (!val) return "Outside Representative";
                  const found = availableEntries.find((e) => e.id === val);
                  return (
                    found?.displayName ??
                    (val === team.playerEntry?.id
                      ? team.playerEntry.displayName
                      : val)
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Outside Representative</SelectItem>
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
          <FieldLabel htmlFor={`manage-email-${team.id}`}>
            Representative email
          </FieldLabel>
          <Input
            id={`manage-email-${team.id}`}
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            value={email}
          />
        </Field>
        <Button
          disabled={pending || email.trim() === "" || reason.trim() === ""}
          type="submit"
          variant="secondary"
        >
          Replace representative
        </Button>
      </form>

      {errorMessage && <FieldError>{errorMessage}</FieldError>}
    </li>
  );
}

export function ManageConsole({
  auctionId,
  management: initialManagement,
}: {
  auctionId: string;
  management: AuctionManagement;
}) {
  const [management, setManagement] = useState(initialManagement);
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerPhone, setPlayerPhone] = useState("");
  const [tierId, setTierId] = useState("");
  const [rosterMin, setRosterMin] = useState(text(management.rules?.rosterMin));
  const [rosterMax, setRosterMax] = useState(text(management.rules?.rosterMax));
  const [tierLimits, setTierLimits] = useState(
    Object.fromEntries(
      management.tiers.map((tier) => [
        tier.id,
        { max: text(tier.maxPerTeam), min: text(tier.minPerTeam) },
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [notice, setNotice] = useState<null | string>(null);
  const [cancelled, setCancelled] = useState(false);

  const apply = (result: ManageResult) => {
    if (result.status === "saved") {
      setNotice(result.notice);
      setMessage(null);
      if (result.management) {
        setManagement(result.management);
        setRosterLimitsFrom(result.management);
      } else {
        // Cancellation leaves nothing left to manage.
        setCancelled(true);
      }
    } else {
      setNotice(null);
      setMessage(result.message);
    }
  };

  function setRosterLimitsFrom(next: AuctionManagement) {
    setRosterMin(text(next.rules?.rosterMin));
    setRosterMax(text(next.rules?.rosterMax));
    setTierLimits(
      Object.fromEntries(
        next.tiers.map((tier) => [
          tier.id,
          { max: text(tier.maxPerTeam), min: text(tier.minPerTeam) },
        ]),
      ),
    );
  }

  async function run(action: () => Promise<ManageResult>) {
    setPending(true);
    setMessage(null);
    setNotice(null);
    try {
      apply(await action());
    } catch {
      setMessage("The connection dropped before the server answered.");
    } finally {
      setPending(false);
    }
  }

  if (cancelled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Auction cancelled
          </CardTitle>
          <CardDescription>
            The Auction is permanently read-only and cannot resume.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const paused = management.status === "paused";
  const unopenedTiers = management.tiers.filter((tier) => !tier.opened);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            {management.status === "paused"
              ? "Paused Auction changes"
              : "Auction management"}
          </CardTitle>
          <CardDescription>
            Every accepted change records an immutable Audit Entry and is
            announced to participants. A Live Auction must be Paused first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field className="max-w-lg">
            <FieldLabel htmlFor="manage-reason">
              Reason for this change
            </FieldLabel>
            <Input
              id="manage-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </Field>

          {message && <FieldError>{message}</FieldError>}
          {notice && (
            <p aria-live="polite" className="text-sm" role="status">
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Representatives
          </CardTitle>
          <CardDescription>
            A replaced Representative loses command and channel access the
            moment the change commits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col">
            {management.teams.map((team) => (
              <RepresentativeRow
                auctionId={auctionId}
                entries={management.selectableEntries}
                key={`${team.id}:${team.representative?.email ?? ""}:${team.invitation?.email ?? ""}:${team.playerEntry?.id ?? ""}`}
                onSaved={(next) => {
                  if (next) {
                    setManagement(next);
                    setNotice("Representative replaced.");
                  }
                }}
                reason={reason}
                team={team}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Ownership
          </CardTitle>
          <CardDescription>
            Transfer the Auction to a registered, verified User who represents
            no Team in it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="max-w-xs">
            <FieldLabel htmlFor="manage-owner-email">
              New Organizer email
            </FieldLabel>
            <Input
              id="manage-owner-email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              value={email}
            />
          </Field>
          <Button
            disabled={pending || email.trim() === "" || reason.trim() === ""}
            onClick={() =>
              run(() => transferOwnershipAction(auctionId, { email, reason }))
            }
            type="button"
            variant="secondary"
          >
            Transfer ownership
          </Button>
        </CardContent>
      </Card>

      {paused && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Budget
            </CardTitle>
            <CardDescription>
              Increase every Team&apos;s Budget by the same whole number of
              Credits. A Budget can never be lowered or changed for one Team.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <Field className="max-w-40">
              <FieldLabel htmlFor="manage-budget">Increase by</FieldLabel>
              <Input
                id="manage-budget"
                inputMode="numeric"
                onChange={(event) => setAmount(event.target.value)}
                value={amount}
              />
            </Field>
            <Button
              disabled={pending || amount.trim() === "" || reason.trim() === ""}
              onClick={() =>
                run(() => increaseBudgetAction(auctionId, { amount, reason }))
              }
              type="button"
              variant="secondary"
            >
              Increase every Budget
            </Button>
          </CardContent>
        </Card>
      )}

      {paused && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Add Players
            </CardTitle>
            <CardDescription>
              Players may only join a Tier that has not been offered yet, and a
              Starting Price cannot change after bidding has begun.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field className="max-w-xs">
                <FieldLabel htmlFor="manage-player-name">
                  Display name
                </FieldLabel>
                <Input
                  id="manage-player-name"
                  onChange={(event) => setPlayerName(event.target.value)}
                  value={playerName}
                />
              </Field>
              <Field className="max-w-xs">
                <FieldLabel htmlFor="manage-player-phone">
                  Phone number (optional)
                </FieldLabel>
                <Input
                  id="manage-player-phone"
                  onChange={(event) => setPlayerPhone(event.target.value)}
                  value={playerPhone}
                />
              </Field>
              {management.rulesMode === "tiered" && (
                <Field className="max-w-xs">
                  <FieldLabel htmlFor="manage-player-tier">Tier</FieldLabel>
                  <Select
                    items={[
                      { label: "Choose an unopened Tier", value: "" },
                      ...unopenedTiers.map((tier) => ({
                        label: tier.label,
                        value: tier.id,
                      })),
                    ]}
                    onValueChange={(val) => setTierId(val ?? "")}
                    value={tierId}
                  >
                    <SelectTrigger className="w-full" id="manage-player-tier">
                      <SelectValue placeholder="Choose an unopened Tier">
                        {(val: string | null) =>
                          val
                            ? (unopenedTiers.find((t) => t.id === val)?.label ?? val)
                            : undefined
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="">Choose an unopened Tier</SelectItem>
                        {unopenedTiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {tier.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Button
                disabled={
                  pending ||
                  playerName.trim() === "" ||
                  reason.trim() === "" ||
                  (management.rulesMode === "tiered" && tierId === "")
                }
                onClick={() =>
                  run(() =>
                    addPlayersAction(auctionId, {
                      players: [
                        {
                          displayName: playerName,
                          phoneNumber: playerPhone,
                          tierId:
                            management.rulesMode === "tiered" ? tierId : null,
                        },
                      ],
                      reason,
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Add Player
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {paused && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Constraints
            </CardTitle>
            <CardDescription>
              Adjust Roster and Tier minimums and maximums. A maximum cannot
              drop below what a Team already holds, and the change must keep a
              Legal Completion.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Field className="max-w-40">
                <FieldLabel htmlFor="manage-roster-min">
                  Minimum Roster size
                </FieldLabel>
                <Input
                  id="manage-roster-min"
                  inputMode="numeric"
                  onChange={(event) => setRosterMin(event.target.value)}
                  value={rosterMin}
                />
              </Field>
              <Field className="max-w-40">
                <FieldLabel htmlFor="manage-roster-max">
                  Maximum Roster size
                </FieldLabel>
                <Input
                  id="manage-roster-max"
                  inputMode="numeric"
                  onChange={(event) => setRosterMax(event.target.value)}
                  value={rosterMax}
                />
              </Field>
            </div>

            {management.tiers.map((tier) => (
              <div className="flex flex-wrap gap-3" key={tier.id}>
                <Field className="max-w-40">
                  <FieldLabel htmlFor={`manage-tier-min-${tier.id}`}>
                    {tier.label} minimum
                  </FieldLabel>
                  <Input
                    id={`manage-tier-min-${tier.id}`}
                    inputMode="numeric"
                    onChange={(event) =>
                      setTierLimits((current) => ({
                        ...current,
                        [tier.id]: {
                          max: current[tier.id]?.max ?? "",
                          min: event.target.value,
                        },
                      }))
                    }
                    value={tierLimits[tier.id]?.min ?? ""}
                  />
                </Field>
                <Field className="max-w-40">
                  <FieldLabel htmlFor={`manage-tier-max-${tier.id}`}>
                    {tier.label} maximum
                  </FieldLabel>
                  <Input
                    id={`manage-tier-max-${tier.id}`}
                    inputMode="numeric"
                    onChange={(event) =>
                      setTierLimits((current) => ({
                        ...current,
                        [tier.id]: {
                          max: event.target.value,
                          min: current[tier.id]?.min ?? "",
                        },
                      }))
                    }
                    value={tierLimits[tier.id]?.max ?? ""}
                  />
                </Field>
              </div>
            ))}

            <div>
              <Button
                disabled={pending || reason.trim() === ""}
                onClick={() =>
                  run(() =>
                    changeConstraintsAction(auctionId, {
                      reason,
                      rosterMax,
                      rosterMin,
                      tiers: management.tiers.map((tier) => ({
                        maxPerTeam: tierLimits[tier.id]?.max ?? "",
                        minPerTeam: tierLimits[tier.id]?.min ?? "0",
                        tierId: tier.id,
                      })),
                    }),
                  )
                }
                type="button"
                variant="secondary"
              >
                Save constraints
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {paused && (
        <Card>
          <CardHeader>
            <CardTitle aria-level={2} role="heading">
              Cancel Auction
            </CardTitle>
            <CardDescription>
              A cancelled Auction is permanently read-only and cannot resume.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              disabled={pending || reason.trim() === ""}
              onClick={() =>
                run(() => cancelAuctionAction(auctionId, { reason }))
              }
              type="button"
              variant="destructive"
            >
              Cancel Auction
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
