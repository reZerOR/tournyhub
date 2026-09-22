import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { StationGroup, StationLamp, StationPlate } from "@/components/arena";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { READINESS_GROUPS, type ReadinessIssue } from "@/domain/readiness";

const GROUP_LABELS: Record<(typeof READINESS_GROUPS)[number], string> = {
  feasibility: "Feasibility",
  invitations: "Invitations",
  players: "Players",
  rules: "Rules",
  teams: "Teams",
  tiers: "Tiers",
};

/*
  Readiness is a checklist, not an explanation: one lane per group that still
  has something wrong, one line per requirement, and one Fix link that goes
  straight to the station that owns it. The launch gate itself lives in the
  command bar, so this surface never offers a second way to start.
*/
function IssueRows({ issues }: { issues: ReadinessIssue[] }) {
  return (
    <ul className="flex flex-1 flex-col divide-y divide-border/50">
      {issues.map((issue, index) => (
        <li
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
          key={`${issue.group}-${index}`}
        >
          <span className="text-sm text-pretty">{issue.message}</span>
          <Link
            className="font-mono text-xs text-neon underline-offset-4 hover:underline"
            href={issue.href}
          >
            Fix
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ReadinessView({
  readiness,
}: {
  readiness: {
    errors: ReadinessIssue[];
    ready: boolean;
    warnings: ReadinessIssue[];
  };
}) {
  const outstanding = readiness.errors.length;

  return (
    <StationPlate
      label="Readiness"
      stat={
        <span className={readiness.ready ? "text-roster" : "text-warning"}>
          {readiness.ready ? "ready" : `${outstanding} open`}
        </span>
      }
    >
      <p
        aria-live="polite"
        className="flex items-start gap-2.5 text-sm"
        role="status"
      >
        {readiness.ready ? (
          <CircleCheck
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-roster"
          />
        ) : (
          <TriangleAlert
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
        )}
        {readiness.ready
          ? "Every requirement holds. This Auction is Ready."
          : `${outstanding} requirement${
              outstanding === 1 ? "" : "s"
            } still need attention.`}
      </p>

      {outstanding > 0 && (
        <StationGroup label="Requirements">
          <div className="flex flex-col divide-y divide-border/60">
            {READINESS_GROUPS.map((group) => {
              const grouped = readiness.errors.filter(
                (issue) => issue.group === group,
              );
              if (grouped.length === 0) return null;
              return (
                <div
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-5"
                  key={group}
                >
                  <span className="flex items-center gap-2.5 sm:w-36 sm:shrink-0">
                    <StationLamp
                      state={group === "feasibility" ? "blocked" : "pending"}
                    />
                    <span className="text-[0.7rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      {GROUP_LABELS[group]}
                    </span>
                  </span>
                  <IssueRows issues={grouped} />
                </div>
              );
            })}
          </div>
        </StationGroup>
      )}

      {readiness.warnings.length > 0 && (
        <StationGroup label="Warnings">
          <Alert variant="warning">
            <AlertTitle>{readiness.warnings.length} warning</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col divide-y divide-warning/20">
                {readiness.warnings.map((warning, index) => (
                  <li
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
                    key={`${warning.group}-${index}`}
                  >
                    <span className="text-balance text-warning/90">
                      {warning.message}
                    </span>
                    <Link
                      className="font-mono text-xs text-warning underline-offset-4 hover:underline"
                      href={warning.href}
                    >
                      Fix
                    </Link>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </StationGroup>
      )}

      <p className="font-mono text-xs text-muted-foreground">
        derived from setup · an edit returns it to Draft
      </p>
    </StationPlate>
  );
}
