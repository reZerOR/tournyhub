"use client";

import { memo, useEffect, useRef, useState } from "react";

interface LiveCountdownProps {
  closeDeadline: string | null;
  clockOffsetMs: number;
  compact?: boolean;
  fallbackLabel?: string;
  finalizing?: boolean;
  onExpired?: (deadline: string) => void;
  warningDeadline: string | null;
}

export const LiveCountdown = memo(function LiveCountdown({
  closeDeadline,
  clockOffsetMs,
  compact = false,
  fallbackLabel,
  finalizing = false,
  onExpired,
  warningDeadline,
}: LiveCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const notifiedDeadline = useRef<string | null>(null);
  const deadline = warningDeadline ?? closeDeadline;
  const remaining = deadline
    ? Math.max(0, (Date.parse(deadline) - (now - clockOffsetMs)) / 1000)
    : null;

  useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadline]);

  useEffect(() => {
    if (remaining === null || remaining > 0 || !deadline || !onExpired) return;
    if (notifiedDeadline.current === deadline) return;
    notifiedDeadline.current = deadline;
    onExpired(deadline);
  }, [deadline, onExpired, remaining]);

  if (compact) {
    if (finalizing || remaining === 0)
      return (
        <span className="animate-pulse text-[10px] font-semibold text-emerald-400">
          Finalizing Sale…
        </span>
      );
    if (warningDeadline && remaining !== null)
      return (
        <span className="animate-pulse text-[10px] font-bold text-amber-400">
          Closing in {remaining.toFixed(1)}s
        </span>
      );
    if (closeDeadline && remaining !== null && remaining <= 5)
      return (
        <span className="animate-pulse text-[10px] font-bold text-amber-400">
          Anti-Snipe: {remaining.toFixed(1)}s
        </span>
      );
    return fallbackLabel ? (
      <span className="text-[10px] text-muted-foreground">{fallbackLabel}</span>
    ) : null;
  }

  if (remaining === null) return null;
  if (remaining === 0)
    return (
      <p
        aria-live="assertive"
        className="text-sm font-bold text-emerald-400 sm:text-base"
        role="status"
      >
        Finalizing…
      </p>
    );
  return warningDeadline ? (
    <p className="animate-pulse text-sm font-bold text-amber-400 tabular-nums sm:text-base">
      Closing in {remaining.toFixed(1)}s
    </p>
  ) : (
    <p className="text-sm font-bold text-primary tabular-nums sm:text-base">
      Timed Close in {remaining.toFixed(1)}s
    </p>
  );
});
