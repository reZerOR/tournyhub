import { Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CloseMode, RulesMode } from "@/domain/auction";

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
        onValueChange={(next) => {
          const nextValue = next[0];
          if (nextValue === "simple" || nextValue === "tiered") {
            onChange(nextValue);
          }
        }}
        value={[value]}
        variant="outline"
      >
        <ToggleGroupItem value="simple">Simple Rules</ToggleGroupItem>
        <ToggleGroupItem value="tiered">Tiered Rules</ToggleGroupItem>
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
        onValueChange={(next) => {
          const nextValue = next[0];
          if (nextValue === "manual" || nextValue === "timed") {
            onChange(nextValue);
          }
        }}
        value={[value]}
        variant="outline"
      >
        <ToggleGroupItem value="manual">Manual Close</ToggleGroupItem>
        <ToggleGroupItem value="timed">Timed Close</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}
