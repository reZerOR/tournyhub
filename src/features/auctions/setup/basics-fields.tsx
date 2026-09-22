import { Hand, List, ListOrdered, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CloseMode, RulesMode } from "@/domain/auction";

/*
  A mode chooser, not a pair of radio buttons: each option states what it
  changes in the monospace register the rest of the console uses, so the
  difference between two options can be read without a sentence explaining
  either one.
*/
const optionCardClassName =
  "h-auto min-h-14 w-full flex-col items-stretch gap-1.5 rounded-lg p-3 text-left whitespace-normal aria-pressed:border-neon/60 aria-pressed:bg-neon/10 aria-pressed:text-foreground";

function OptionLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold">
      {icon}
      {children}
    </span>
  );
}

function OptionValue({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">{children}</span>
  );
}

export function RulesModeField({
  onChange,
  value,
}: {
  onChange: (value: RulesMode) => void;
  value: RulesMode;
}) {
  return (
    <Field>
      <FieldLabel>Rules</FieldLabel>
      <ToggleGroup
        aria-label="Rules"
        className="grid w-full gap-2 sm:grid-cols-2"
        onValueChange={(next) => {
          const nextValue = next[0];
          if (nextValue === "simple" || nextValue === "tiered") {
            onChange(nextValue);
          }
        }}
        value={[value]}
        variant="outline"
      >
        <ToggleGroupItem className={optionCardClassName} value="simple">
          <OptionLabel icon={<List aria-hidden className="size-4 shrink-0" />}>
            Simple Rules
          </OptionLabel>
          <OptionValue>one pool · one price</OptionValue>
        </ToggleGroupItem>
        <ToggleGroupItem className={optionCardClassName} value="tiered">
          <OptionLabel
            icon={<ListOrdered aria-hidden className="size-4 shrink-0" />}
          >
            Tiered Rules
          </OptionLabel>
          <OptionValue>ordered Tiers · per-Tier price</OptionValue>
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}

export function CloseModeField({
  onChange,
  value,
}: {
  onChange: (value: CloseMode) => void;
  value: CloseMode;
}) {
  return (
    <Field>
      <FieldLabel>Close</FieldLabel>
      <ToggleGroup
        aria-label="Close"
        className="grid w-full gap-2 sm:grid-cols-2"
        onValueChange={(next) => {
          const nextValue = next[0];
          if (nextValue === "manual" || nextValue === "timed") {
            onChange(nextValue);
          }
        }}
        value={[value]}
        variant="outline"
      >
        <ToggleGroupItem className={optionCardClassName} value="manual">
          <OptionLabel icon={<Hand aria-hidden className="size-4 shrink-0" />}>
            Manual Close
          </OptionLabel>
          <OptionValue>3s warning · your call</OptionValue>
        </ToggleGroupItem>
        <ToggleGroupItem className={optionCardClassName} value="timed">
          <OptionLabel icon={<Timer aria-hidden className="size-4 shrink-0" />}>
            Timed Close
          </OptionLabel>
          <OptionValue>30s countdown, per Player</OptionValue>
        </ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}
