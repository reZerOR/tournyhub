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
import { RULE_LIMITS } from "@/domain/rules";
import { saveSimpleRulesAction } from "@/features/auctions/setup/rules-actions";
import type { SerializedRuleSet } from "@/features/auctions/setup/serialize-team";

function text(value: null | number): string {
  return value === null ? "" : String(value);
}

export function RulesEditor({
  auctionId,
  ruleSet,
  rulesMode,
}: {
  auctionId: string;
  ruleSet: SerializedRuleSet;
  rulesMode: "simple" | "tiered";
}) {
  const [budget, setBudget] = useState(text(ruleSet.budget));
  const [bidIncrement, setBidIncrement] = useState(text(ruleSet.bidIncrement));
  const [rosterMin, setRosterMin] = useState(text(ruleSet.rosterMin));
  const [rosterMax, setRosterMax] = useState(text(ruleSet.rosterMax));
  const [defaultStartingPrice, setDefaultStartingPrice] = useState(
    text(ruleSet.defaultStartingPrice),
  );
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [hasSaved, setHasSaved] = useState(false);

  if (rulesMode === "tiered") {
    return (
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Rules
          </CardTitle>
          <CardDescription>
            This Auction uses Tiered Rules. Configure Tiered Rules and Tiers in
            a later step.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    const result = await saveSimpleRulesAction(auctionId, {
      bidIncrement,
      budget,
      defaultStartingPrice,
      rosterMax,
      rosterMin,
    });
    setPending(false);
    if (result.status === "saved") {
      setBudget(text(result.ruleSet.budget));
      setBidIncrement(text(result.ruleSet.bidIncrement));
      setRosterMin(text(result.ruleSet.rosterMin));
      setRosterMax(text(result.ruleSet.rosterMax));
      setDefaultStartingPrice(text(result.ruleSet.defaultStartingPrice));
      setHasSaved(true);
    } else {
      setHasSaved(false);
      setErrorMessage(result.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Rules
        </CardTitle>
        <CardDescription>
          Simple Rules give every Team the same Budget, Bid Increment, total
          Roster limits, and default Starting Price.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={save}>
          <div className="flex flex-wrap gap-4">
            <Field className="max-w-40">
              <FieldLabel htmlFor="rules-budget">Budget</FieldLabel>
              <Input
                id="rules-budget"
                inputMode="numeric"
                onChange={(event) => setBudget(event.target.value)}
                value={budget}
              />
            </Field>
            <Field className="max-w-40">
              <FieldLabel htmlFor="rules-increment">Bid Increment</FieldLabel>
              <Input
                id="rules-increment"
                inputMode="numeric"
                onChange={(event) => setBidIncrement(event.target.value)}
                value={bidIncrement}
              />
            </Field>
            <Field className="max-w-40">
              <FieldLabel htmlFor="rules-roster-min">
                Minimum Roster size
              </FieldLabel>
              <Input
                id="rules-roster-min"
                inputMode="numeric"
                onChange={(event) => setRosterMin(event.target.value)}
                value={rosterMin}
              />
            </Field>
            <Field className="max-w-40">
              <FieldLabel htmlFor="rules-roster-max">
                Maximum Roster size
              </FieldLabel>
              <Input
                id="rules-roster-max"
                inputMode="numeric"
                onChange={(event) => setRosterMax(event.target.value)}
                value={rosterMax}
              />
            </Field>
            <Field className="max-w-48">
              <FieldLabel htmlFor="rules-starting-price">
                Default Starting Price
              </FieldLabel>
              <Input
                id="rules-starting-price"
                inputMode="numeric"
                onChange={(event) =>
                  setDefaultStartingPrice(event.target.value)
                }
                value={defaultStartingPrice}
              />
            </Field>
          </div>

          <p className="text-sm text-muted-foreground">
            Budgets and prices are whole Credits, at most{" "}
            {RULE_LIMITS.budgetMax.toLocaleString()} for a Budget.
          </p>

          {errorMessage && <FieldError>{errorMessage}</FieldError>}

          <div className="flex items-center gap-3">
            <Button disabled={pending} type="submit">
              Save Rules
            </Button>
            <p
              aria-live="polite"
              className="text-sm text-muted-foreground"
              role="status"
            >
              {pending ? "Saving…" : hasSaved ? "Saved" : ""}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
