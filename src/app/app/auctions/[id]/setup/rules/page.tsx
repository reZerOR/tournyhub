import { notFound } from "next/navigation";

import { RulesEditor } from "@/features/auctions/setup/rules-editor";
import { requireEditableAuction } from "@/features/auctions/setup/data";
import { serializeRuleSet } from "@/features/auctions/setup/serialize-team";
import { getRuleSetForOrganizer } from "@/server/auction-query/rules";
import { getCurrentSession } from "@/server/auth/session";
import { getPool } from "@/server/database/pool";

export default async function RulesSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auction = await requireEditableAuction(id);
  const session = await getCurrentSession();
  if (!session) notFound();

  const ruleSet = await getRuleSetForOrganizer(getPool(), session.user.id, id);
  if (!ruleSet) notFound();

  return (
    <RulesEditor
      auctionId={id}
      closeMode={auction.closeMode}
      ruleSet={serializeRuleSet(ruleSet)}
      rulesMode={auction.rulesMode}
    />
  );
}
