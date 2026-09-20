"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { READINESS_GROUPS, type ReadinessIssue } from "@/domain/readiness";
import { startAuctionAction } from "@/features/auctions/setup/readiness-actions";

const GROUP_LABELS: Record<(typeof READINESS_GROUPS)[number], string> = {
  feasibility: "Feasibility",
  invitations: "Invitations",
  players: "Players",
  rules: "Rules",
  teams: "Teams",
};

function IssueList({
  issues,
  title,
}: {
  issues: ReadinessIssue[];
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="flex flex-col gap-2">
        {READINESS_GROUPS.map((group) => {
          const grouped = issues.filter((issue) => issue.group === group);
          if (grouped.length === 0) return null;
          return (
            <li key={group} className="flex flex-col gap-1">
              <span className="text-sm font-medium">{GROUP_LABELS[group]}</span>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {grouped.map((issue, index) => (
                  <li key={`${group}-${index}`} className="text-sm">
                    {issue.message}{" "}
                    <Link className="underline" href={issue.href}>
                      Fix
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ReadinessView({
  auctionId,
  readiness,
}: {
  auctionId: string;
  readiness: {
    errors: ReadinessIssue[];
    ready: boolean;
    warnings: ReadinessIssue[];
  };
}) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [issues, setIssues] = useState<string[]>([]);

  async function start() {
    setPending(true);
    setErrorMessage(null);
    setIssues([]);
    const result = await startAuctionAction(auctionId);
    setPending(false);
    if (result.status === "error") {
      setErrorMessage(result.message);
      setIssues(result.issues);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Readiness
        </CardTitle>
        <CardDescription>
          Readiness is derived from the current setup. The Auction returns to
          Draft when an edit makes it invalid.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p aria-live="polite" className="text-sm font-medium" role="status">
          {readiness.ready
            ? "Every requirement holds. This Auction is Ready."
            : `${readiness.errors.length} requirement${
                readiness.errors.length === 1 ? "" : "s"
              } still need attention.`}
        </p>

        {readiness.errors.length > 0 && (
          <IssueList issues={readiness.errors} title="Errors" />
        )}

        {readiness.warnings.length > 0 && (
          <Alert>
            <AlertTitle>Warnings</AlertTitle>
            <AlertDescription>
              <IssueList issues={readiness.warnings} title="Warnings" />
            </AlertDescription>
          </Alert>
        )}

        {errorMessage && <FieldError>{errorMessage}</FieldError>}
        {issues.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        )}

        <div>
          <Button
            disabled={pending || !readiness.ready}
            onClick={start}
            type="button"
          >
            {pending && <Spinner data-icon="inline-start" />}
            Start Auction
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
