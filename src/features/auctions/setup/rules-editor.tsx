"use client";

import { type FormEvent, useState } from "react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RULE_LIMITS } from "@/domain/rules";
import {
  saveSimpleRulesAction,
  saveTieredRulesAction,
} from "@/features/auctions/setup/rules-actions";
import {
  SaveReadout,
  type SaveState,
} from "@/features/auctions/setup/save-readout";
import type { SerializedRuleSet } from "@/features/auctions/setup/serialize-team";

function text(value: null | number): string {
  return value === null ? "" : String(value);
}

/*
  Every Rule is a whole number with a unit, so the unit is drawn inside the
  field rather than explained beneath it.
*/
function NumberField({
  id,
  label,
  onChange,
  unit,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  unit?: string;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          className="pr-9 font-mono tabular-nums"
          id={id}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
        {unit ? (
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-xs text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

export function RulesEditor({
  auctionId,
  closeMode,
  ruleSet,
  rulesMode,
}: {
  auctionId: string;
  closeMode: "manual" | "timed";
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
  const [timedCloseSeconds, setTimedCloseSeconds] = useState(
    text(ruleSet.timedCloseSeconds),
  );
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    setSaveState("saving");
    const result =
      rulesMode === "tiered"
        ? await saveTieredRulesAction(auctionId, {
            bidIncrement,
            budget,
            rosterMax,
            rosterMin,
            timedCloseSeconds,
          })
        : await saveSimpleRulesAction(auctionId, {
            bidIncrement,
            budget,
            defaultStartingPrice,
            rosterMax,
            rosterMin,
            timedCloseSeconds,
          });
    setPending(false);
    if (result.status === "saved") {
      setBudget(text(result.ruleSet.budget));
      setBidIncrement(text(result.ruleSet.bidIncrement));
      setRosterMin(text(result.ruleSet.rosterMin));
      setRosterMax(text(result.ruleSet.rosterMax));
      setDefaultStartingPrice(text(result.ruleSet.defaultStartingPrice));
      setTimedCloseSeconds(text(result.ruleSet.timedCloseSeconds));
      setSaveState("saved");
    } else {
      setSaveState("error");
      setErrorMessage(result.message);
    }
  }

  return (
    <form onSubmit={save}>
      <StationPlate
        footer={
          <>
            <p className="font-mono text-xs text-muted-foreground">
              applies to every Team
            </p>
            <Button disabled={pending} type="submit">
              Save Rules
            </Button>
          </>
        }
        label="Rules"
        stat={<SaveReadout message={errorMessage} state={saveState} />}
      >
        <StationGroup
          hint={
            rulesMode === "tiered"
              ? `whole credits · max ${RULE_LIMITS.budgetMax.toLocaleString()} · price set per Tier`
              : `whole credits · max ${RULE_LIMITS.budgetMax.toLocaleString()}`
          }
          label="Money"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <NumberField
              id="rules-budget"
              label="Budget"
              onChange={setBudget}
              unit="cr"
              value={budget}
            />
            <NumberField
              id="rules-increment"
              label="Bid Increment"
              onChange={setBidIncrement}
              unit="cr"
              value={bidIncrement}
            />
            {rulesMode === "simple" && (
              <NumberField
                id="rules-starting-price"
                label="Default Starting Price"
                onChange={setDefaultStartingPrice}
                unit="cr"
                value={defaultStartingPrice}
              />
            )}
          </div>
        </StationGroup>

        <StationGroup
          hint={`Players per Team · max ${RULE_LIMITS.rosterMax.toLocaleString()}`}
          label="Roster"
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <NumberField
              id="rules-roster-min"
              label="Minimum Roster size"
              onChange={setRosterMin}
              value={rosterMin}
            />
            <NumberField
              id="rules-roster-max"
              label="Maximum Roster size"
              onChange={setRosterMax}
              value={rosterMax}
            />
          </div>
        </StationGroup>

        {closeMode === "timed" && (
          <StationGroup
            hint={`${RULE_LIMITS.timedCloseSecondsMin}–${RULE_LIMITS.timedCloseSecondsMax}s`}
            label="Timing"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <NumberField
                id="rules-timed-close"
                label="Timed Close (seconds)"
                onChange={setTimedCloseSeconds}
                unit="s"
                value={timedCloseSeconds}
              />
            </div>
          </StationGroup>
        )}

        {errorMessage && <FieldError>{errorMessage}</FieldError>}
      </StationPlate>
    </form>
  );
}
