"use server";

import { z } from "zod";

import {
  calculateFeasibleTeamCounts,
  type TeamCountResult,
} from "@/domain/team-calculator";
import { TeamLogoError } from "@/domain/team-logo";
import {
  applyCalculatedTeams,
  createTeam,
  deleteTeam,
  removeTeamLogo,
  reorderTeams,
  setTeamLogo,
  TeamSetupError,
  updateTeam,
} from "@/server/auction-command/teams";
import {
  getTeamCountBasisForOrganizer,
  getTeamsForOrganizer,
} from "@/server/auction-query/teams";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import {
  serializeTeam,
  type SerializedTeam,
} from "@/features/auctions/setup/serialize-team";

const NOT_EDITABLE = "This Auction is no longer available to edit.";

export type TeamResult =
  | { status: "saved"; team: SerializedTeam }
  | { message: string; status: "error" };

export type TeamsResult =
  | { status: "saved"; teams: SerializedTeam[] }
  | { message: string; status: "error" };

export type RemovedResult =
  { status: "saved" } | { message: string; status: "error" };

export type TeamCountsResult =
  | { result: TeamCountResult; status: "counts" }
  | { message: string; status: "error" };

function toError(error: unknown): { message: string; status: "error" } {
  if (error instanceof z.ZodError) {
    return {
      message: error.issues[0]?.message ?? "Enter valid Team data.",
      status: "error",
    };
  }
  if (error instanceof TeamSetupError || error instanceof TeamLogoError) {
    return { message: error.message, status: "error" };
  }
  throw error;
}

export async function loadTeamsAction(
  auctionId: string,
): Promise<null | SerializedTeam[]> {
  const session = await getCurrentSession();
  if (!session) return null;

  const teams = await getTeamsForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  if (!teams) return null;
  return teams.map((team) => serializeTeam(team, auctionId));
}

export async function createTeamAction(
  auctionId: string,
  input: { color: string; name: string },
): Promise<TeamResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const team = await createTeam(getPool(), session.user.id, auctionId, input);
    if (!team) return { message: NOT_EDITABLE, status: "error" };
    return { status: "saved", team: serializeTeam(team, auctionId) };
  } catch (error) {
    return toError(error);
  }
}

export async function updateTeamAction(
  auctionId: string,
  teamId: string,
  input: { color: string; name: string },
): Promise<TeamResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const team = await updateTeam(
      getPool(),
      session.user.id,
      auctionId,
      teamId,
      input,
    );
    if (!team) return { message: NOT_EDITABLE, status: "error" };
    return { status: "saved", team: serializeTeam(team, auctionId) };
  } catch (error) {
    return toError(error);
  }
}

export async function deleteTeamAction(
  auctionId: string,
  teamId: string,
): Promise<RemovedResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const removed = await deleteTeam(
    getPool(),
    session.user.id,
    auctionId,
    teamId,
  );
  if (!removed) return { message: NOT_EDITABLE, status: "error" };
  return { status: "saved" };
}

async function reorderAndReload(
  auctionId: string,
  orderedTeamIds: string[],
): Promise<TeamsResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const teams = await reorderTeams(
    getPool(),
    session.user.id,
    auctionId,
    orderedTeamIds,
  );
  if (!teams) return { message: NOT_EDITABLE, status: "error" };
  return {
    status: "saved",
    teams: teams.map((team) => serializeTeam(team, auctionId)),
  };
}

export async function moveTeamAction(
  auctionId: string,
  teamId: string,
  direction: "down" | "up",
): Promise<TeamsResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const teams = await getTeamsForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  if (!teams) return { message: NOT_EDITABLE, status: "error" };

  const index = teams.findIndex((team) => team.id === teamId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= teams.length) {
    return {
      status: "saved",
      teams: teams.map((team) => serializeTeam(team, auctionId)),
    };
  }

  const ordered = [...teams];
  [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
  return reorderAndReload(
    auctionId,
    ordered.map((team) => team.id),
  );
}

export async function calculateTeamCountsAction(
  auctionId: string,
  input: { maxRosterSize: string; minRosterSize: string },
): Promise<TeamCountsResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to continue.", status: "error" };

  const basis = await getTeamCountBasisForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  if (!basis) return { message: NOT_EDITABLE, status: "error" };

  try {
    return {
      result: calculateFeasibleTeamCounts({ ...input, ...basis }),
      status: "counts",
    };
  } catch (error) {
    return toError(error);
  }
}

export async function applyCalculatedTeamsAction(
  auctionId: string,
  input: { count: number; maxRosterSize: string; minRosterSize: string },
): Promise<TeamsResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const basis = await getTeamCountBasisForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  if (!basis) return { message: NOT_EDITABLE, status: "error" };

  try {
    const applied = await applyCalculatedTeams(
      getPool(),
      session.user.id,
      auctionId,
      { ...basis, ...input },
    );
    if (!applied) return { message: NOT_EDITABLE, status: "error" };
    return {
      status: "saved",
      teams: applied.teams.map((team) => serializeTeam(team, auctionId)),
    };
  } catch (error) {
    return toError(error);
  }
}

export async function setTeamLogoAction(
  auctionId: string,
  teamId: string,
  formData: FormData,
): Promise<TeamResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Choose a PNG logo.", status: "error" };
  }

  try {
    const team = await setTeamLogo(
      getPool(),
      session.user.id,
      auctionId,
      teamId,
      new Uint8Array(await file.arrayBuffer()),
    );
    if (!team) return { message: NOT_EDITABLE, status: "error" };
    return { status: "saved", team: serializeTeam(team, auctionId) };
  } catch (error) {
    return toError(error);
  }
}

export async function removeTeamLogoAction(
  auctionId: string,
  teamId: string,
): Promise<TeamResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  const removed = await removeTeamLogo(
    getPool(),
    session.user.id,
    auctionId,
    teamId,
  );
  if (!removed) return { message: NOT_EDITABLE, status: "error" };

  const teams = await getTeamsForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  const team = teams?.find((candidate) => candidate.id === teamId);
  if (!team) return { message: NOT_EDITABLE, status: "error" };
  return { status: "saved", team: serializeTeam(team, auctionId) };
}
