"use client";

import Image from "next/image";
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
import { TEAM_LIMITS } from "@/domain/team";
import type { TeamCountResult } from "@/domain/team-calculator";
import {
  applyCalculatedTeamsAction,
  calculateTeamCountsAction,
  createTeamAction,
  deleteTeamAction,
  moveTeamAction,
  removeTeamLogoAction,
  setTeamLogoAction,
  updateTeamAction,
} from "@/features/auctions/setup/team-actions";
import type { SerializedTeam } from "@/features/auctions/setup/serialize-team";

interface TeamFormValues {
  color: string;
  name: string;
}

const EMPTY_TEAM: TeamFormValues = { color: "", name: "" };

function representativeLabel(team: SerializedTeam): string {
  if (team.representativeType === "player") return "Player Representative";
  if (team.representativeType === "outside") return "Outside Representative";
  return "No representative";
}

export function TeamsEditor({
  auctionId,
  teams: initialTeams,
}: {
  auctionId: string;
  teams: SerializedTeam[];
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [hasSaved, setHasSaved] = useState(false);

  const [newTeam, setNewTeam] = useState<TeamFormValues>(EMPTY_TEAM);
  const [editingId, setEditingId] = useState<null | string>(null);
  const [editing, setEditing] = useState<TeamFormValues>(EMPTY_TEAM);
  const [editingError, setEditingError] = useState<null | string>(null);

  const [minRosterSize, setMinRosterSize] = useState("");
  const [maxRosterSize, setMaxRosterSize] = useState("");
  const [counts, setCounts] = useState<null | TeamCountResult>(null);
  const [selectedCount, setSelectedCount] = useState<null | number>(null);
  const [calculatorError, setCalculatorError] = useState<null | string>(null);

  function reportSaved() {
    setErrorMessage(null);
    setHasSaved(true);
  }

  function reportError(message: string) {
    setHasSaved(false);
    setErrorMessage(message);
  }

  async function addTeam(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await createTeamAction(auctionId, newTeam);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) =>
        [...previous, result.team].sort((a, b) => a.position - b.position),
      );
      setNewTeam(EMPTY_TEAM);
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setPending(true);
    const result = await updateTeamAction(auctionId, editingId, editing);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) =>
        previous.map((team) => (team.id === editingId ? result.team : team)),
      );
      setEditingId(null);
      setEditingError(null);
      reportSaved();
    } else {
      setEditingError(result.message);
    }
  }

  async function removeTeam(teamId: string) {
    setPending(true);
    const result = await deleteTeamAction(auctionId, teamId);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) => previous.filter((team) => team.id !== teamId));
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function move(teamId: string, direction: "down" | "up") {
    setPending(true);
    const result = await moveTeamAction(auctionId, teamId, direction);
    setPending(false);
    if (result.status === "saved") {
      setTeams(result.teams);
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function uploadLogo(event: FormEvent<HTMLFormElement>, teamId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    const result = await setTeamLogoAction(auctionId, teamId, formData);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) =>
        previous.map((team) => (team.id === teamId ? result.team : team)),
      );
      event.currentTarget.reset();
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function removeLogo(teamId: string) {
    setPending(true);
    const result = await removeTeamLogoAction(auctionId, teamId);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) =>
        previous.map((team) => (team.id === teamId ? result.team : team)),
      );
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function calculate(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setCalculatorError(null);
    const result = await calculateTeamCountsAction(auctionId, {
      maxRosterSize,
      minRosterSize,
    });
    setPending(false);
    if (result.status === "counts") {
      setCounts(result.result);
      setSelectedCount(result.result.recommendation);
    } else {
      setCounts(null);
      setCalculatorError(result.message);
    }
  }

  async function applyCount(count: number) {
    setPending(true);
    setCalculatorError(null);
    const result = await applyCalculatedTeamsAction(auctionId, {
      count,
      maxRosterSize,
      minRosterSize,
    });
    setPending(false);
    if (result.status === "saved") {
      setTeams(result.teams);
      setCounts(null);
      setSelectedCount(null);
      reportSaved();
    } else {
      setCalculatorError(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Teams
          </CardTitle>
          <CardDescription>
            Create Teams with unique names, or calculate how many the current
            Players can fill.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <form className="flex flex-wrap items-end gap-3" onSubmit={addTeam}>
            <Field className="max-w-xs">
              <FieldLabel htmlFor="new-team-name">Team name</FieldLabel>
              <Input
                id="new-team-name"
                maxLength={TEAM_LIMITS.nameMax}
                onChange={(event) =>
                  setNewTeam((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
                value={newTeam.name}
              />
            </Field>
            <Field className="max-w-40">
              <FieldLabel htmlFor="new-team-color">Color</FieldLabel>
              <Input
                id="new-team-color"
                onChange={(event) =>
                  setNewTeam((previous) => ({
                    ...previous,
                    color: event.target.value,
                  }))
                }
                placeholder="#1a2b3c"
                value={newTeam.color}
              />
            </Field>
            <Button disabled={pending} type="submit">
              Add Team
            </Button>
          </form>

          <p
            aria-live="polite"
            className="text-sm text-muted-foreground"
            role="status"
          >
            {pending
              ? "Saving…"
              : errorMessage
                ? `Failed to save: ${errorMessage}`
                : hasSaved
                  ? "Saved"
                  : ""}
          </p>

          <table className="w-full text-sm">
            <caption className="sr-only">Teams</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium" scope="col">
                  Order
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Name
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Color
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Logo
                </th>
                <th className="py-2 pr-3 font-medium" scope="col">
                  Representative
                </th>
                <th className="py-2 font-medium" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 && (
                <tr>
                  <td className="py-3 text-muted-foreground" colSpan={6}>
                    You haven&apos;t created any Teams yet.
                  </td>
                </tr>
              )}
              {teams.map((team, index) => (
                <tr className="border-b align-top last:border-0" key={team.id}>
                  <td className="py-2 pr-3">
                    <div className="flex gap-1">
                      <Button
                        aria-label={`Move ${team.name ?? "Team"} up`}
                        disabled={pending || index === 0}
                        onClick={() => move(team.id, "up")}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        ↑
                      </Button>
                      <Button
                        aria-label={`Move ${team.name ?? "Team"} down`}
                        disabled={pending || index === teams.length - 1}
                        onClick={() => move(team.id, "down")}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        ↓
                      </Button>
                    </div>
                  </td>
                  <td className="py-2 pr-3">{team.name ?? "Unnamed Team"}</td>
                  <td className="py-2 pr-3">
                    {team.color ? (
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block size-4 rounded-full border"
                          style={{ backgroundColor: team.color }}
                        />
                        {team.color}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-2">
                      {team.logoHref && (
                        <Image
                          alt={`${team.name ?? "Team"} logo`}
                          className="size-8 rounded"
                          height={32}
                          src={team.logoHref}
                          width={32}
                        />
                      )}
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(event) => uploadLogo(event, team.id)}
                      >
                        <Input
                          accept="image/png"
                          aria-label={`Logo for ${team.name ?? "Team"}`}
                          className="max-w-40"
                          name="logo"
                          type="file"
                        />
                        <Button
                          disabled={pending}
                          size="sm"
                          type="submit"
                          variant="outline"
                        >
                          Upload
                        </Button>
                      </form>
                      {team.logoHref && (
                        <Button
                          disabled={pending}
                          onClick={() => removeLogo(team.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remove logo
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{representativeLabel(team)}</td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        onClick={() => {
                          setEditingId(team.id);
                          setEditing({
                            color: team.color ?? "",
                            name: team.name ?? "",
                          });
                          setEditingError(null);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => removeTeam(team.id)}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editingId && (
            <form
              className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
              onSubmit={saveTeam}
            >
              <Field className="max-w-xs">
                <FieldLabel htmlFor="edit-team-name">Team name</FieldLabel>
                <Input
                  id="edit-team-name"
                  maxLength={TEAM_LIMITS.nameMax}
                  onChange={(event) =>
                    setEditing((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                  value={editing.name}
                />
              </Field>
              <Field className="max-w-40">
                <FieldLabel htmlFor="edit-team-color">Color</FieldLabel>
                <Input
                  id="edit-team-color"
                  onChange={(event) =>
                    setEditing((previous) => ({
                      ...previous,
                      color: event.target.value,
                    }))
                  }
                  placeholder="#1a2b3c"
                  value={editing.color}
                />
              </Field>
              <Button disabled={pending} type="submit">
                Save Team
              </Button>
              <Button
                onClick={() => {
                  setEditingId(null);
                  setEditingError(null);
                }}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              {editingError && <FieldError>{editingError}</FieldError>}
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Calculate Teams
          </CardTitle>
          <CardDescription>
            Enter the total minimum and maximum Roster sizes. Every feasible
            Team count is shown with one recommendation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-wrap items-end gap-3" onSubmit={calculate}>
            <Field className="max-w-40">
              <FieldLabel htmlFor="calc-roster-min">
                Minimum Roster size
              </FieldLabel>
              <Input
                id="calc-roster-min"
                inputMode="numeric"
                onChange={(event) => setMinRosterSize(event.target.value)}
                value={minRosterSize}
              />
            </Field>
            <Field className="max-w-40">
              <FieldLabel htmlFor="calc-roster-max">
                Maximum Roster size
              </FieldLabel>
              <Input
                id="calc-roster-max"
                inputMode="numeric"
                onChange={(event) => setMaxRosterSize(event.target.value)}
                value={maxRosterSize}
              />
            </Field>
            <Button disabled={pending} type="submit">
              Calculate
            </Button>
          </form>

          {calculatorError && <FieldError>{calculatorError}</FieldError>}

          {counts && (
            <div className="flex flex-col gap-3">
              {counts.feasibleCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {counts.explanation}
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    Feasible Team counts: {counts.feasibleCounts.join(", ")}.
                    Recommended: {counts.recommendation}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {counts.feasibleCounts.map((count) => (
                      <Button
                        key={count}
                        onClick={() => setSelectedCount(count)}
                        type="button"
                        variant={
                          selectedCount === count ? "default" : "outline"
                        }
                      >
                        {count} Teams
                        {counts.recommendation === count
                          ? " (recommended)"
                          : ""}
                      </Button>
                    ))}
                  </div>
                  <div>
                    <Button
                      disabled={pending || selectedCount === null}
                      onClick={() =>
                        selectedCount !== null && applyCount(selectedCount)
                      }
                      type="button"
                    >
                      Create {selectedCount ?? 0} unnamed Teams
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
