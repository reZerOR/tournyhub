"use client";

import { type FormEvent, useState } from "react";

import { StationGroup, StationPlate } from "@/components/arena";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TEAM_LIMITS } from "@/domain/team";
import type { TeamCountResult } from "@/domain/team-calculator";
import {
  SaveReadout,
  type SaveState,
} from "@/features/auctions/setup/save-readout";
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
import { TeamColorInput } from "@/features/auctions/setup/team-color-input";
import { TeamTable } from "@/features/auctions/setup/team-table";
import type { SerializedTeam } from "@/features/auctions/setup/serialize-team";

interface TeamFormValues {
  color: string;
  name: string;
}

const EMPTY_TEAM: TeamFormValues = { color: "", name: "" };

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
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Add Team Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTeam, setNewTeam] = useState<TeamFormValues>(EMPTY_TEAM);
  const [addError, setAddError] = useState<null | string>(null);

  // Edit Team Modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<null | string>(null);
  const [editing, setEditing] = useState<TeamFormValues>(EMPTY_TEAM);
  const [editingError, setEditingError] = useState<null | string>(null);

  // Calculator
  const [minRosterSize, setMinRosterSize] = useState("");
  const [maxRosterSize, setMaxRosterSize] = useState("");
  const [counts, setCounts] = useState<null | TeamCountResult>(null);
  const [selectedCount, setSelectedCount] = useState<null | number>(null);
  const [calculatorError, setCalculatorError] = useState<null | string>(null);

  function reportSaved() {
    setErrorMessage(null);
    setSaveState("saved");
  }

  function reportError(message: string) {
    setSaveState("error");
    setErrorMessage(message);
  }

  async function handleAddTeam(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setSaveState("saving");
    setAddError(null);
    const result = await createTeamAction(auctionId, newTeam);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) =>
        [...previous, result.team].sort((a, b) => a.position - b.position),
      );
      setNewTeam(EMPTY_TEAM);
      setIsAddOpen(false);
      reportSaved();
    } else {
      setAddError(result.message);
      reportError(result.message);
    }
  }

  function openEditModal(team: SerializedTeam) {
    setEditingId(team.id);
    setEditing({
      color: team.color ?? "",
      name: team.name ?? "",
    });
    setEditingError(null);
    setIsEditOpen(true);
  }

  async function handleSaveTeam(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setPending(true);
    setSaveState("saving");
    setEditingError(null);
    const result = await updateTeamAction(auctionId, editingId, editing);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) =>
        previous.map((team) => (team.id === editingId ? result.team : team)),
      );
      setIsEditOpen(false);
      setEditingId(null);
      reportSaved();
    } else {
      setSaveState("error");
      setEditingError(result.message);
    }
  }

  async function removeTeam(teamId: string) {
    setPending(true);
    setSaveState("saving");
    const result = await deleteTeamAction(auctionId, teamId);
    setPending(false);
    if (result.status === "saved") {
      setTeams((previous) => previous.filter((team) => team.id !== teamId));
      if (editingId === teamId) {
        setIsEditOpen(false);
        setEditingId(null);
      }
      reportSaved();
    } else {
      reportError(result.message);
    }
  }

  async function move(teamId: string, direction: "down" | "up") {
    setPending(true);
    setSaveState("saving");
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
    setSaveState("saving");
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
    setSaveState("saving");
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

  const unnamedCount = teams.filter((team) => team.name === null).length;

  return (
    <div className="flex flex-col gap-5">
      <StationPlate
        label="Teams"
        stat={
          <>
            <span className="text-muted-foreground/70">
              {teams.length} of {TEAM_LIMITS.maxTeams}
              {unnamedCount > 0 ? ` · ${unnamedCount} unnamed` : ""}
            </span>
            <SaveReadout message={errorMessage} state={saveState} />
          </>
        }
      >
        <StationGroup label="Current Teams">
          <TeamTable
            onAddClick={() => {
              setNewTeam(EMPTY_TEAM);
              setAddError(null);
              setIsAddOpen(true);
            }}
            onEditClick={openEditModal}
            onMoveClick={move}
            onRemoveClick={removeTeam}
            onRemoveLogoClick={removeLogo}
            onUploadLogoSubmit={uploadLogo}
            pending={pending}
            teams={teams}
          />
        </StationGroup>
      </StationPlate>

      {/* Add Team Modal */}
      <Dialog onOpenChange={setIsAddOpen} open={isAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team</DialogTitle>
            <DialogDescription>
              Create a new team for this auction roster.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddTeam}>
            <div className="flex flex-col gap-4 py-2">
              <Field>
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
                  placeholder="e.g. Thunderbolts"
                  value={newTeam.name}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="new-team-color">Team color</FieldLabel>
                <TeamColorInput
                  id="new-team-color"
                  onChange={(color) =>
                    setNewTeam((previous) => ({
                      ...previous,
                      color,
                    }))
                  }
                  value={newTeam.color}
                />
              </Field>

              {addError && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{addError}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                onClick={() => setIsAddOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Adding..." : "Add Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Team Modal */}
      <Dialog
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditingId(null);
            setEditingError(null);
          }
        }}
        open={isEditOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
            <DialogDescription>
              Update name and color for {editing.name || "this team"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTeam}>
            <div className="flex flex-col gap-4 py-2">
              <Field>
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
                  placeholder="e.g. Thunderbolts"
                  value={editing.name}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-team-color">Team color</FieldLabel>
                <TeamColorInput
                  id="edit-team-color"
                  onChange={(color) =>
                    setEditing((previous) => ({
                      ...previous,
                      color,
                    }))
                  }
                  value={editing.color}
                />
              </Field>

              {editingError && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{editingError}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                onClick={() => setIsEditOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Calculate Teams section */}
      <StationPlate label="Calculate Teams" variant="section">
        <form className="flex flex-wrap items-end gap-3" onSubmit={calculate}>
          <Field className="max-w-44">
            <FieldLabel htmlFor="calc-roster-min">
              Minimum Roster size
            </FieldLabel>
            <Input
              className="font-mono tabular-nums"
              id="calc-roster-min"
              inputMode="numeric"
              onChange={(event) => setMinRosterSize(event.target.value)}
              value={minRosterSize}
            />
          </Field>
          <Field className="max-w-44">
            <FieldLabel htmlFor="calc-roster-max">
              Maximum Roster size
            </FieldLabel>
            <Input
              className="font-mono tabular-nums"
              id="calc-roster-max"
              inputMode="numeric"
              onChange={(event) => setMaxRosterSize(event.target.value)}
              value={maxRosterSize}
            />
          </Field>
          <Button disabled={pending} type="submit" variant="secondary">
            Calculate
          </Button>
        </form>

        {calculatorError && <FieldError>{calculatorError}</FieldError>}

        {counts &&
          (counts.feasibleCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {counts.explanation}
            </p>
          ) : (
            <>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                Feasible Team counts: {counts.feasibleCounts.join(", ")}.
                Recommended: {counts.recommendation}.
              </p>
              <div
                aria-label="Feasible Team counts"
                className="flex flex-wrap gap-2"
                role="group"
              >
                {counts.feasibleCounts.map((count) => (
                  <Button
                    aria-pressed={selectedCount === count}
                    key={count}
                    onClick={() => setSelectedCount(count)}
                    type="button"
                    variant={selectedCount === count ? "default" : "outline"}
                  >
                    {count} Teams
                    {counts.recommendation === count ? " (recommended)" : ""}
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
          ))}
      </StationPlate>
    </div>
  );
}
