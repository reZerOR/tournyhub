"use server";

import { z } from "zod";

import {
  RuleSetupError,
  saveSimpleRules,
  saveTieredRules,
} from "@/server/auction-command/rules";
import { getRuleSetForOrganizer } from "@/server/auction-query/rules";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";
import {
  serializeRuleSet,
  type SerializedRuleSet,
} from "@/features/auctions/setup/serialize-team";

const NOT_EDITABLE = "This Auction is no longer available to edit.";

export type RulesResult =
  | { ruleSet: SerializedRuleSet; status: "saved" }
  | { message: string; status: "error" };

export async function loadRulesAction(
  auctionId: string,
): Promise<null | SerializedRuleSet> {
  const session = await getCurrentSession();
  if (!session) return null;

  const ruleSet = await getRuleSetForOrganizer(
    getPool(),
    session.user.id,
    auctionId,
  );
  return ruleSet ? serializeRuleSet(ruleSet) : null;
}

export async function saveSimpleRulesAction(
  auctionId: string,
  input: {
    bidIncrement: string;
    budget: string;
    defaultStartingPrice: string;
    rosterMax: string;
    rosterMin: string;
    timedCloseSeconds: string;
  },
): Promise<RulesResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const ruleSet = await saveSimpleRules(
      getPool(),
      session.user.id,
      auctionId,
      input,
    );
    if (!ruleSet) return { message: NOT_EDITABLE, status: "error" };
    return { ruleSet: serializeRuleSet(ruleSet), status: "saved" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        message: error.issues[0]?.message ?? "Enter valid Rules.",
        status: "error",
      };
    }
    if (error instanceof RuleSetupError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}

export async function saveTieredRulesAction(
  auctionId: string,
  input: {
    bidIncrement: string;
    budget: string;
    rosterMax: string;
    rosterMin: string;
    timedCloseSeconds: string;
  },
): Promise<RulesResult> {
  const session = await getCurrentSession();
  if (!session) return { message: "Sign in to save changes.", status: "error" };

  try {
    const ruleSet = await saveTieredRules(
      getPool(),
      session.user.id,
      auctionId,
      input,
    );
    if (!ruleSet) return { message: NOT_EDITABLE, status: "error" };
    return { ruleSet: serializeRuleSet(ruleSet), status: "saved" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        message: error.issues[0]?.message ?? "Enter valid Rules.",
        status: "error",
      };
    }
    if (error instanceof RuleSetupError) {
      return { message: error.message, status: "error" };
    }
    throw error;
  }
}
