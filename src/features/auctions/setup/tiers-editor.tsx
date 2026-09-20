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
import {
  assignPlayerTierAction,
  createTierAction,
  deleteTierAction,
  moveTierAction,
  updateTierAction,
} from "@/features/auctions/setup/tier-actions";
import type {
  SerializedTier,
  SerializedTierAssignment,
} from "@/features/auctions/setup/serialize-team";

interface TierDraft {
  label: string;
  maxPerTeam: string;
  minPerTeam: string;
  startingPrice: string;
}

function toDraft(tier: SerializedTier): TierDraft {
  return {
    label: tier.label,
    maxPerTeam: String(tier.maxPerTeam),
    minPerTeam: String(tier.minPerTeam),
    startingPrice: String(tier.startingPrice),
  };
}

export function TiersEditor({
  auctionId,
  assignments,
  tiers,
}: {
  auctionId: string;
  assignments: SerializedTierAssignment[];
  tiers: SerializedTier[];
}) {
  const [currentTiers, setCurrentTiers] = useState(tiers);
  const [currentAssignments, setCurrentAssignments] = useState(assignments);
  const [drafts, setDrafts] = useState<Record<string, TierDraft>>(() =>
    Object.fromEntries(tiers.map((tier) => [tier.id, toDraft(tier)])),
  );
  const [newTier, setNewTier] = useState<TierDraft>({
    label: "",
    maxPerTeam: "",
    minPerTeam: "0",
    startingPrice: "",
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [status, setStatus] = useState<null | string>(null);

  function applyTiers(next: SerializedTier[]) {
    setCurrentTiers(next);
    setDrafts(Object.fromEntries(next.map((tier) => [tier.id, toDraft(tier)])));
  }

  async function run(
    action: () => Promise<
      | { message: string; status: "error" }
      | { status: "saved"; tiers: SerializedTier[] }
    >,
  ) {
    setPending(true);
    setMessage(null);
    const result = await action();
    setPending(false);
    if (result.status === "saved") {
      applyTiers(result.tiers);
      setStatus("Saved");
    } else {
      setStatus(null);
      setMessage(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Tiers
          </CardTitle>
          <CardDescription>
            Ordered Player categories with their own Starting Price and shared
            per-Team minimum and maximum counts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {currentTiers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No Tiers yet. Add one below.
            </p>
          )}

          <ul className="flex flex-col gap-4">
            {currentTiers.map((tier, index) => {
              const draft = drafts[tier.id] ?? toDraft(tier);
              return (
                <li
                  className="flex flex-col gap-3 rounded-md border p-3"
                  key={tier.id}
                >
                  <div className="flex flex-wrap gap-3">
                    <Field className="min-w-40 flex-1">
                      <FieldLabel htmlFor={`tier-${tier.id}-label`}>
                        Tier name
                      </FieldLabel>
                      <Input
                        id={`tier-${tier.id}-label`}
                        onChange={(event) =>
                          setDrafts((all) => ({
                            ...all,
                            [tier.id]: { ...draft, label: event.target.value },
                          }))
                        }
                        value={draft.label}
                      />
                    </Field>
                    <Field className="max-w-32">
                      <FieldLabel htmlFor={`tier-${tier.id}-price`}>
                        Starting Price
                      </FieldLabel>
                      <Input
                        id={`tier-${tier.id}-price`}
                        inputMode="numeric"
                        onChange={(event) =>
                          setDrafts((all) => ({
                            ...all,
                            [tier.id]: {
                              ...draft,
                              startingPrice: event.target.value,
                            },
                          }))
                        }
                        value={draft.startingPrice}
                      />
                    </Field>
                    <Field className="max-w-32">
                      <FieldLabel htmlFor={`tier-${tier.id}-min`}>
                        Min per Team
                      </FieldLabel>
                      <Input
                        id={`tier-${tier.id}-min`}
                        inputMode="numeric"
                        onChange={(event) =>
                          setDrafts((all) => ({
                            ...all,
                            [tier.id]: {
                              ...draft,
                              minPerTeam: event.target.value,
                            },
                          }))
                        }
                        value={draft.minPerTeam}
                      />
                    </Field>
                    <Field className="max-w-32">
                      <FieldLabel htmlFor={`tier-${tier.id}-max`}>
                        Max per Team
                      </FieldLabel>
                      <Input
                        id={`tier-${tier.id}-max`}
                        inputMode="numeric"
                        onChange={(event) =>
                          setDrafts((all) => ({
                            ...all,
                            [tier.id]: {
                              ...draft,
                              maxPerTeam: event.target.value,
                            },
                          }))
                        }
                        value={draft.maxPerTeam}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() => updateTierAction(auctionId, tier.id, draft))
                      }
                      type="button"
                    >
                      Save
                    </Button>
                    <Button
                      disabled={pending || index === 0}
                      onClick={() =>
                        run(() => moveTierAction(auctionId, tier.id, "up"))
                      }
                      type="button"
                      variant="secondary"
                    >
                      Move up
                    </Button>
                    <Button
                      disabled={pending || index === currentTiers.length - 1}
                      onClick={() =>
                        run(() => moveTierAction(auctionId, tier.id, "down"))
                      }
                      type="button"
                      variant="secondary"
                    >
                      Move down
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() => deleteTierAction(auctionId, tier.id))
                      }
                      type="button"
                      variant="destructive"
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <Field className="min-w-40 flex-1">
              <FieldLabel htmlFor="new-tier-label">New Tier name</FieldLabel>
              <Input
                id="new-tier-label"
                onChange={(event) =>
                  setNewTier((draft) => ({
                    ...draft,
                    label: event.target.value,
                  }))
                }
                value={newTier.label}
              />
            </Field>
            <Field className="max-w-32">
              <FieldLabel htmlFor="new-tier-price">Starting Price</FieldLabel>
              <Input
                id="new-tier-price"
                inputMode="numeric"
                onChange={(event) =>
                  setNewTier((draft) => ({
                    ...draft,
                    startingPrice: event.target.value,
                  }))
                }
                value={newTier.startingPrice}
              />
            </Field>
            <Field className="max-w-32">
              <FieldLabel htmlFor="new-tier-min">Min per Team</FieldLabel>
              <Input
                id="new-tier-min"
                inputMode="numeric"
                onChange={(event) =>
                  setNewTier((draft) => ({
                    ...draft,
                    minPerTeam: event.target.value,
                  }))
                }
                value={newTier.minPerTeam}
              />
            </Field>
            <Field className="max-w-32">
              <FieldLabel htmlFor="new-tier-max">Max per Team</FieldLabel>
              <Input
                id="new-tier-max"
                inputMode="numeric"
                onChange={(event) =>
                  setNewTier((draft) => ({
                    ...draft,
                    maxPerTeam: event.target.value,
                  }))
                }
                value={newTier.maxPerTeam}
              />
            </Field>
            <Button
              disabled={pending || newTier.label.trim().length === 0}
              onClick={async () => {
                await run(() => createTierAction(auctionId, newTier));
                setNewTier({
                  label: "",
                  maxPerTeam: "",
                  minPerTeam: "0",
                  startingPrice: "",
                });
              }}
              type="button"
            >
              Add Tier
            </Button>
          </div>

          {message && <FieldError>{message}</FieldError>}
          <p
            aria-live="polite"
            className="text-sm text-muted-foreground"
            role="status"
          >
            {pending ? "Saving…" : (status ?? "")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Tier assignments
          </CardTitle>
          <CardDescription>
            Every biddable Player needs a Tier before a Tiered Auction can
            start.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentTiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a Tier before assigning Players.
            </p>
          ) : currentAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add Player Entries first.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {currentAssignments.map((assignment) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3"
                  key={assignment.id}
                >
                  <span className="text-sm">{assignment.displayName}</span>
                  <select
                    className="rounded-md border bg-transparent px-2 py-1 text-sm"
                    onChange={async (event) => {
                      const value = event.target.value || null;
                      const result = await assignPlayerTierAction(
                        auctionId,
                        assignment.id,
                        value,
                      );
                      if (result.status === "saved") {
                        setCurrentAssignments((all) =>
                          all.map((entry) =>
                            entry.id === assignment.id
                              ? { ...entry, tierId: value }
                              : entry,
                          ),
                        );
                      } else {
                        setMessage(result.message ?? "Could not assign Tier.");
                      }
                    }}
                    value={assignment.tierId ?? ""}
                  >
                    <option value="">Unassigned</option>
                    {currentTiers.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
