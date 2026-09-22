"use client";

import * as React from "react";
import { Pipette, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const PRESET_COLORS = [
  { label: "Electric Cyan", value: "#00f0ff" },
  { label: "Royal Blue", value: "#3b82f6" },
  { label: "Neon Purple", value: "#a855f7" },
  { label: "Rose Pink", value: "#ec4899" },
  { label: "Crimson Red", value: "#ef4444" },
  { label: "Vibrant Orange", value: "#f97316" },
  { label: "Amber Gold", value: "#f59e0b" },
  { label: "Emerald Green", value: "#10b981" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Slate Gray", value: "#64748b" },
];

interface TeamColorInputProps {
  id?: string;
  onChange: (color: string) => void;
  value: string;
}

export function TeamColorInput({
  id = "team-color",
  onChange,
  value,
}: TeamColorInputProps) {
  const trimmed = value.trim();
  const isValidHex = HEX_COLOR.test(trimmed);
  const pickerValue = isValidHex ? trimmed : "#3b82f6";

  function handlePickerChange(event: React.ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  function handleTextChange(event: React.ChangeEvent<HTMLInputElement>) {
    let inputVal = event.target.value;
    if (inputVal && !inputVal.startsWith("#")) {
      inputVal = `#${inputVal}`;
    }
    onChange(inputVal);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {/* Actual native color picker input */}
        <div className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-input bg-card shadow-xs transition-colors hover:border-ring focus-within:ring-2 focus-within:ring-ring">
          <input
            aria-label="Choose team color"
            className="absolute -inset-2 size-[150%] cursor-pointer border-0 bg-transparent p-0"
            id={`${id}-picker`}
            onChange={handlePickerChange}
            type="color"
            value={pickerValue}
          />
          {!isValidHex && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/60 text-muted-foreground">
              <Pipette className="size-4" />
            </div>
          )}
        </div>

        {/* Text input for manual hex typing */}
        <div className="relative flex-1">
          <Input
            className="font-mono uppercase"
            id={id}
            maxLength={7}
            onChange={handleTextChange}
            placeholder="#3B82F6"
            value={value}
          />
          {value && (
            <Button
              aria-label="Clear color"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => onChange("")}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Quick preset color swatches */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {PRESET_COLORS.map((preset) => (
          <button
            aria-label={preset.label}
            className={cn(
              "size-6 rounded-md border transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring",
              trimmed.toLowerCase() === preset.value.toLowerCase()
                ? "border-foreground ring-2 ring-foreground/40 scale-105"
                : "border-border/60 hover:border-foreground/40",
            )}
            key={preset.value}
            onClick={() => onChange(preset.value)}
            style={{ backgroundColor: preset.value }}
            title={`${preset.label} (${preset.value})`}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
